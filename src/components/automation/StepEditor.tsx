'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Variable } from 'lucide-react';
import { C, Modal, Button, Label, TextInput, TextArea, Select } from './ui';
import { actionColor, actionIcon, channelLabel } from './helpers';
import { getAction } from '@/lib/automation/catalog';
import type { ConfigField, ConditionConfig, ConditionOperator, ConditionRule, WorkflowStep } from '@/lib/automation/types';
import type { BuilderMeta } from './api';

interface Props {
  step: WorkflowStep;
  meta: BuilderMeta;
  onChange: (step: WorkflowStep) => void;
  onClose: () => void;
}

export function StepEditor({ step, meta, onChange, onClose }: Props) {
  const isCondition = step.step_type === 'condition';
  const def = getAction(step.step_type);
  const [config, setConfig] = useState<Record<string, unknown>>({ ...(step.config ?? {}) });

  const set = (key: string, value: unknown) => setConfig((c) => ({ ...c, [key]: value }));
  const save = () => { onChange({ ...step, config }); onClose(); };

  const title = isCondition ? 'Edit condition gate' : (def?.label ?? step.step_type);
  const accent = isCondition ? C.violet : actionColor(step.step_type);

  return (
    <Modal
      title={title}
      subtitle={isCondition ? 'The workflow stops unless these rules match.' : def?.description}
      onClose={onClose}
      width={600}
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Apply</Button></>}
    >
      {isCondition
        ? <ConditionEditor config={config as unknown as ConditionConfig} meta={meta} onChange={(c) => setConfig(c as unknown as Record<string, unknown>)} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: `${accent}10` }}>
              <span style={{ color: accent }}>{actionIcon(step.step_type, 18, accent)}</span>
              <span style={{ fontSize: 12.5, color: C.sub }}>{def?.description}</span>
            </div>
            {(def?.fields ?? []).map((field) => (
              <FieldEditor
                key={field.key}
                field={field}
                value={config[field.key]}
                meta={meta}
                onChange={(v) => set(field.key, v)}
              />
            ))}
            {def?.needsContact && (
              <div style={{ fontSize: 11.5, color: C.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                <Variable size={12} /> Use {'{{contact.first_name}}'}, {'{{contact.name}}'} etc. in message fields.
              </div>
            )}
          </div>
        )}
    </Modal>
  );
}

// ── Action field renderer ───────────────────────────────────
function FieldEditor({ field, value, meta, onChange }: { field: ConfigField; value: unknown; meta: BuilderMeta; onChange: (v: unknown) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const vars = meta.variables ?? [];

  const insertVar = (token: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
    } else {
      onChange(`${String(value ?? '')}${token}`);
    }
  };

  const options = field.key === 'assignee_id' ? meta.agents.map((a) => ({ value: a.value, label: a.label })) : field.options;

  return (
    <div>
      <Label required={field.required}>{field.label}</Label>
      {field.type === 'textarea' ? (
        <>
          <TextArea ref={textareaRef} value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {vars.slice(0, 8).map((v) => (
              <button key={v.token} type="button" onClick={() => insertVar(v.token)}
                style={{ fontSize: 10.5, fontWeight: 600, color: C.primary, background: 'rgba(79,109,245,0.08)', border: '1px solid rgba(79,109,245,0.20)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>
                {v.label}
              </button>
            ))}
          </div>
        </>
      ) : field.type === 'select' || field.type === 'channel' ? (
        <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(options ?? []).map((o) => <option key={o.value} value={o.value}>{field.type === 'channel' ? channelLabel(o.value) : o.label}</option>)}
        </Select>
      ) : field.type === 'number' ? (
        <TextInput type="number" min={field.min} max={field.max} value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      ) : field.type === 'boolean' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.sub }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {field.label}
        </label>
      ) : field.type === 'datetime' ? (
        <TextInput type="datetime-local" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <TextInput value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.help && <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>{field.help}</div>}
    </div>
  );
}

// ── Condition rule editor ───────────────────────────────────
function ConditionEditor({ config, meta, onChange }: { config: ConditionConfig; meta: BuilderMeta; onChange: (c: ConditionConfig) => void }) {
  const rules = config?.rules ?? [];
  const match = config?.match ?? 'all';

  const update = (patch: Partial<ConditionConfig>) => onChange({ match, rules, ...patch });
  const setRule = (i: number, patch: Partial<ConditionRule>) => update({ rules: rules.map((r, ri) => (ri === i ? { ...r, ...patch } : r)) });
  const addRule = () => update({ rules: [...rules, { field: meta.condition_fields[0]?.key ?? 'contact.source', operator: 'equals', value: '' }] });
  const removeRule = (i: number) => update({ rules: rules.filter((_, ri) => ri !== i) });

  const grouped = useMemo(() => {
    const g: Record<string, typeof meta.condition_fields> = {};
    meta.condition_fields.forEach((f) => { (g[f.group] ??= []).push(f); });
    return g;
  }, [meta.condition_fields]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.sub }}>
        Match
        <Select value={match} onChange={(e) => update({ match: e.target.value as 'all' | 'any' })} style={{ width: 130 }}>
          <option value="all">all rules (AND)</option>
          <option value="any">any rule (OR)</option>
        </Select>
      </div>

      {rules.map((rule, i) => {
        const field = meta.condition_fields.find((f) => f.key === rule.field);
        const ops = meta.operators.filter((o) => !field || o.types.includes(field.type));
        const op = meta.operators.find((o) => o.value === rule.operator);
        return (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10, background: 'rgba(139,92,246,0.06)', border: `1px solid ${C.borderSoft}` }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Select value={rule.field} onChange={(e) => {
                  const nf = meta.condition_fields.find((f) => f.key === e.target.value);
                  const validOp = meta.operators.find((o) => o.types.includes(nf?.type ?? 'text'));
                  setRule(i, { field: e.target.value, operator: (validOp?.value ?? 'equals') as ConditionOperator, value: '' });
                }} style={{ flex: 1 }}>
                  {Object.entries(grouped).map(([group, fields]) => (
                    <optgroup key={group} label={group}>
                      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </optgroup>
                  ))}
                </Select>
                <Select value={rule.operator} onChange={(e) => setRule(i, { operator: e.target.value as ConditionOperator })} style={{ width: 150 }}>
                  {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
              {!op?.noValue && (
                field?.type === 'select' ? (
                  <Select value={String(rule.value ?? '')} onChange={(e) => setRule(i, { value: e.target.value })}>
                    <option value="">Value…</option>
                    {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : field?.type === 'number' ? (
                  <TextInput type="number" value={String(rule.value ?? '')} onChange={(e) => setRule(i, { value: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="Value" />
                ) : field?.type === 'datetime' ? (
                  <TextInput type="datetime-local" value={String(rule.value ?? '')} onChange={(e) => setRule(i, { value: e.target.value })} />
                ) : (
                  <TextInput value={Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '')}
                    placeholder={op?.listValue ? 'comma, separated, values' : 'Value'}
                    onChange={(e) => setRule(i, { value: op?.listValue ? e.target.value.split(',').map((s) => s.trim()) : e.target.value })} />
                )
              )}
            </div>
            <button type="button" onClick={() => removeRule(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, padding: 6 }}><Trash2 size={15} /></button>
          </div>
        );
      })}

      <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={addRule}>Add rule</Button>
      <div style={{ fontSize: 11.5, color: C.muted }}>If the rules do not match, the workflow stops and remaining steps are marked skipped.</div>
    </div>
  );
}
