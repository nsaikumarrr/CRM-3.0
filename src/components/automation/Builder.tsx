'use client';

import React, { useMemo, useState } from 'react';
import {
  X, ChevronRight, ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Pencil,
  Sparkles, GitBranch, CheckCircle, AlertTriangle, Zap, LayoutTemplate,
} from 'lucide-react';
import { C, Button, Label, TextInput, TextArea, Select, Pill } from './ui';
import { StepEditor } from './StepEditor';
import { actionIcon, actionColor, describeStep, triggerIcon, triggerMeta, CategoryChip } from './helpers';
import { AutomationApi, type BuilderMeta, type TemplateRow, type ValidationIssue } from './api';
import { validateWorkflow } from '@/lib/automation/validation';
import { getAction, getTrigger } from '@/lib/automation/catalog';
import type { AutomationRecord, WorkflowStep } from '@/lib/automation/types';

interface BuilderProps {
  meta: BuilderMeta;
  templates: TemplateRow[];
  initial?: { automation: AutomationRecord; steps: WorkflowStep[] } | null;
  preset?: { name: string; description: string; trigger_type: string; trigger_config: Record<string, unknown>; steps: WorkflowStep[] } | null;
  onClose: () => void;
  onSaved: (automation: AutomationRecord, action: 'created' | 'updated') => void;
  push: (kind: 'success' | 'error' | 'info', msg: string) => void;
}

const PHASES = [
  { key: 'basics', label: 'Basics' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'review', label: 'Review' },
] as const;
type PhaseKey = typeof PHASES[number]['key'];

function defaultConfigFor(type: string, meta: BuilderMeta): Record<string, unknown> {
  const def = getAction(type);
  const cfg: Record<string, unknown> = {};
  (def?.fields ?? []).forEach((f) => { if (f.defaultValue !== undefined) cfg[f.key] = f.defaultValue; });
  if (type === 'assign_contact' && meta.agents[0]) cfg.assignee_id = meta.agents[0].value;
  return cfg;
}

export function Builder({ meta, templates, initial, preset, onClose, onSaved, push }: BuilderProps) {
  const [phase, setPhase] = useState<PhaseKey>('basics');
  const [name, setName] = useState(initial?.automation.name ?? preset?.name ?? '');
  const [description, setDescription] = useState(initial?.automation.description ?? preset?.description ?? '');
  const [aiEnabled, setAiEnabled] = useState(initial?.automation.ai_enabled ?? false);
  const [triggerType, setTriggerType] = useState(initial?.automation.trigger_type ?? preset?.trigger_type ?? '');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    (initial?.automation.trigger_config as Record<string, unknown>) ?? preset?.trigger_config ?? {}
  );
  const [steps, setSteps] = useState<WorkflowStep[]>(
    (initial?.steps ?? preset?.steps ?? []).map((s, i) => ({ ...s, position: i }))
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<ValidationIssue[]>([]);

  const isEdit = Boolean(initial);
  const triggerDef = triggerType ? getTrigger(triggerType) : undefined;
  const agentMap = useMemo(() => new Map(meta.agents.map((a) => [a.value, a.label])), [meta.agents]);

  const validation = useMemo(
    () => validateWorkflow({ name, trigger_type: triggerType, trigger_config: triggerConfig, steps: steps.map((s, i) => ({ ...s, position: i })) }),
    [name, triggerType, triggerConfig, steps]
  );

  const triggerGroups = useMemo(() => {
    const g: Record<string, typeof meta.triggers> = {};
    meta.triggers.forEach((t) => { (g[t.category] ??= []).push(t); });
    return g;
  }, [meta.triggers]);

  const addStep = (type: string) => {
    const step: WorkflowStep = type === 'condition'
      ? { step_type: 'condition', position: steps.length, config: { match: 'all', rules: [] } }
      : { step_type: type, position: steps.length, config: defaultConfigFor(type, meta) };
    setSteps((s) => [...s, step]);
    setPickerOpen(false);
    setEditingIndex(steps.length);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((s) => { const copy = [...s]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy.map((x, idx) => ({ ...x, position: idx })); });
  };

  const setTrigger = (type: string) => { setTriggerType(type); const def = getTrigger(type); const cfg: Record<string, unknown> = {}; (def?.fields ?? []).forEach((f) => { if (f.defaultValue !== undefined) cfg[f.key] = f.defaultValue; }); setTriggerConfig(cfg); };
  const setTriggerCfg = (key: string, value: unknown) => setTriggerConfig((c) => ({ ...c, [key]: value }));

  const applyTemplate = (t: TemplateRow) => {
    setName(t.name); setDescription(t.description); setTriggerType(t.trigger_type); setTriggerConfig(t.trigger_config ?? {}); setSteps(t.steps.map((s, i) => ({ ...s, position: i })));
  };

  const save = async (activate: boolean) => {
    setSaving(true); setServerErrors([]);
    try {
      const payload = {
        name, description, trigger_type: triggerType, trigger_config: triggerConfig,
        ai_enabled: aiEnabled, steps: steps.map((s, i) => ({ ...s, position: i })), activate,
      };
      let result: AutomationRecord;
      if (isEdit && initial) {
        const res = await AutomationApi.update(initial.automation.id, payload);
        result = res.automation;
      } else {
        const res = await AutomationApi.create(payload);
        result = res.automation;
      }
      push('success', isEdit ? 'Automation updated' : activate ? 'Automation created and activated' : 'Draft saved');
      onSaved(result, isEdit ? 'updated' : 'created');
    } catch (err) {
      const e = err as Error & { issues?: ValidationIssue[] };
      if (e.issues?.length) setServerErrors(e.issues);
      push('error', e.message || 'Failed to save automation');
      setPhase('review');
    } finally {
      setSaving(false);
    }
  };

  const phaseIndex = PHASES.findIndex((p) => p.key === phase);
  const canNext = phase !== 'basics' || name.trim().length > 0;

  return (
    <div className="crm-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,24,0.55)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 1120, height: '92vh', display: 'flex', flexDirection: 'column', padding: 0, animation: 'crm-pop 200ms ease-out' }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${C.primary},${C.violet})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              {isEdit ? <Pencil size={16} /> : <Zap size={17} />}
            </span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 750, color: C.text }}>{isEdit ? 'Edit automation' : 'New automation'}</div>
              <div style={{ fontSize: 11.5, color: C.muted }}>{name || 'Untitled workflow'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={19} /></button>
        </div>

        {/* Phase nav */}
        <div style={{ padding: '10px 22px', borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', gap: 6, flexShrink: 0 }}>
          {PHASES.map((p, i) => {
            const active = p.key === phase;
            const done = i < phaseIndex;
            return (
              <button key={p.key} onClick={() => setPhase(p.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, background: active ? 'rgba(79,109,245,0.12)' : 'transparent', color: active ? C.primary : done ? C.green : C.muted }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: active ? C.primary : done ? C.green : 'rgba(135,144,170,0.18)', color: active || done ? 'white' : C.muted }}>
                  {done ? <CheckCircle size={12} /> : i + 1}
                </span>
                {p.label}
                {i < PHASES.length - 1 && <ChevronRight size={13} style={{ opacity: 0.4 }} />}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
            {phase === 'basics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 620 }}>
                {!isEdit && steps.length === 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      <LayoutTemplate size={13} /> Start from a template
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10 }}>
                      {templates.slice(0, 6).map((t) => (
                        <button key={t.id} onClick={() => applyTemplate(t)}
                          style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12.5, color: C.text }}>{triggerIcon(t.trigger_type, 14)}{t.name}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 5, lineHeight: 1.45 }}>{t.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <Label required>Automation name</Label>
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome new leads" invalid={!name.trim()} />
                </div>
                <div>
                  <Label>Description</Label>
                  <TextArea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} placeholder="What does this automation do?" />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 11, border: `1px solid ${C.border}`, background: 'rgba(139,92,246,0.06)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
                  <Sparkles size={15} color={C.violet} />
                  <span style={{ fontSize: 12.5, color: C.sub }}>Enable AI assistance on this workflow</span>
                </label>
              </div>
            )}

            {phase === 'trigger' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {Object.entries(triggerGroups).map(([cat, triggers]) => (
                  <div key={cat}>
                    <div style={{ marginBottom: 8 }}><CategoryChip category={cat as never} label={meta.trigger_categories[cat] ?? cat} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px,1fr))', gap: 10 }}>
                      {triggers.map((t) => {
                        const selected = triggerType === t.type;
                        return (
                          <button key={t.type} disabled={!t.available} onClick={() => setTrigger(t.type)}
                            style={{ textAlign: 'left', padding: 12, borderRadius: 12, cursor: t.available ? 'pointer' : 'not-allowed', opacity: t.available ? 1 : 0.45, border: `1.5px solid ${selected ? C.primary : C.border}`, background: selected ? 'rgba(79,109,245,0.08)' : 'rgba(255,255,255,0.45)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12.5, color: C.text }}>
                              {triggerIcon(t.type, 14)}{t.label}
                              {!t.available && <Pill color={C.gray}>Soon</Pill>}
                            </div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 5, lineHeight: 1.45 }}>{t.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {triggerDef && triggerDef.fields.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: 12, background: 'rgba(79,109,245,0.05)', border: `1px solid ${C.borderSoft}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>Trigger settings — {triggerDef.label}</div>
                    {triggerDef.fields.map((f) => (
                      <div key={f.key} style={{ maxWidth: 340 }}>
                        <Label required={f.required}>{f.label}</Label>
                        {f.type === 'select' ? (
                          <Select value={String(triggerConfig[f.key] ?? '')} onChange={(e) => setTriggerCfg(f.key, e.target.value)}>
                            <option value="">Any…</option>
                            {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </Select>
                        ) : f.type === 'number' ? (
                          <TextInput type="number" min={f.min} max={f.max} value={String(triggerConfig[f.key] ?? '')} onChange={(e) => setTriggerCfg(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
                        ) : (
                          <TextInput value={String(triggerConfig[f.key] ?? '')} placeholder={f.placeholder} onChange={(e) => setTriggerCfg(f.key, e.target.value)} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {phase === 'workflow' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Steps ({steps.length})</span>
                  <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setPickerOpen(true)}>Add step</Button>
                </div>
                {steps.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', borderRadius: 12, border: `1.5px dashed ${C.border}`, color: C.muted, fontSize: 12.5 }}>
                    No steps yet. Add your first action.
                  </div>
                )}
                {steps.map((step, i) => {
                  const { title, detail } = describeStep(step, agentMap);
                  const color = step.step_type === 'condition' ? C.violet : actionColor(step.step_type);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                      <span style={{ color, display: 'flex' }}>{step.step_type === 'condition' ? <GitBranch size={16} /> : actionIcon(step.step_type, 16, color)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: C.text }}>{title}</div>
                        <div style={{ fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail || 'Not configured'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <IconBtn onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={14} /></IconBtn>
                        <IconBtn onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ArrowDown size={14} /></IconBtn>
                        <IconBtn onClick={() => setEditingIndex(i)}><Pencil size={13} /></IconBtn>
                        <IconBtn danger onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, position: idx })))}><Trash2 size={14} /></IconBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {phase === 'review' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}>
                <SummaryRow label="Name" value={name || '—'} />
                <SummaryRow label="Trigger" value={triggerDef?.label ?? 'None selected'} />
                <SummaryRow label="Steps" value={`${steps.length} step${steps.length === 1 ? '' : 's'}`} />
                <SummaryRow label="AI assistance" value={aiEnabled ? 'Enabled' : 'Disabled'} />

                {serverErrors.length > 0 && (
                  <IssueList title="Could not save" issues={serverErrors} tone="error" />
                )}
                {validation.errors.length > 0 && <IssueList title="Errors" issues={validation.errors} tone="error" />}
                {validation.warnings.length > 0 && <IssueList title="Warnings" issues={validation.warnings} tone="warning" />}
                {validation.valid && serverErrors.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, background: 'rgba(40,201,154,0.08)', color: C.green, fontSize: 12.5, fontWeight: 600 }}>
                    <CheckCircle size={15} /> This workflow is valid and ready to activate.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live preview */}
          <div style={{ width: 320, borderLeft: `1px solid ${C.borderSoft}`, padding: '20px 18px', overflowY: 'auto', flexShrink: 0, background: 'rgba(248,250,255,0.4)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Flow preview</div>
            <FlowNode color={triggerDef ? triggerMeta(triggerType).color : C.gray} icon={triggerDef ? triggerIcon(triggerType, 14) : <Zap size={14} />}
              title={triggerDef?.label ?? 'Select a trigger'} subtitle={`When ${triggerDef?.kind === 'scheduled' ? 'scheduled' : 'this happens'}`} />
            <Connector />
            {steps.map((step, i) => {
              const { title, detail } = describeStep(step, agentMap);
              const color = step.step_type === 'condition' ? C.violet : actionColor(step.step_type);
              return (
                <React.Fragment key={i}>
                  <FlowNode color={color} icon={step.step_type === 'condition' ? <GitBranch size={14} /> : actionIcon(step.step_type, 14, color)} title={title} subtitle={detail || 'Not configured'} />
                  <Connector />
                </React.Fragment>
              );
            })}
            <FlowNode color={C.gray} icon={<CheckCircle size={14} />} title="End" subtitle="Workflow completes" muted />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.borderSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            {validation.errors.length > 0 ? <span style={{ color: C.red }}>{validation.errors.length} issue(s) to fix</span> : <span style={{ color: C.green }}>Ready to save</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} disabled={phaseIndex === 0} onClick={() => setPhase(PHASES[Math.max(0, phaseIndex - 1)].key)}>Back</Button>
            {phase !== 'review' ? (
              <Button variant="primary" size="sm" disabled={!canNext} onClick={() => setPhase(PHASES[Math.min(PHASES.length - 1, phaseIndex + 1)].key)}>Next<ChevronRight size={14} /></Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" loading={saving} onClick={() => save(false)}>Save draft</Button>
                <Button variant="primary" size="sm" loading={saving} disabled={!validation.valid} onClick={() => save(true)}>Save & activate</Button>
              </>
            )}
          </div>
        </div>
      </div>

      {editingIndex !== null && steps[editingIndex] && (
        <StepEditor
          step={steps[editingIndex]}
          meta={meta}
          onChange={(next) => setSteps((s) => s.map((x, idx) => (idx === editingIndex ? next : x)))}
          onClose={() => setEditingIndex(null)}
        />
      )}

      {pickerOpen && (
        <StepPicker meta={meta} onPick={addStep} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

function IconBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', color: danger ? C.red : C.muted, opacity: disabled ? 0.3 : 1, padding: 4 }}>
      {children}
    </button>
  );
}

function Connector() {
  return <div style={{ width: 2, height: 14, background: C.border, marginLeft: 19 }} />;
}

function FlowNode({ color, icon, title, subtitle, muted }: { color: string; icon: React.ReactNode; title: string; subtitle?: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 11, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.65)', opacity: muted ? 0.7 : 1 }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: `${color}1c`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 650, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ fontSize: 12.5, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 650, color: C.text }}>{value}</span>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ValidationIssue[]; tone: 'error' | 'warning' }) {
  const color = tone === 'error' ? C.red : C.yellow;
  return (
    <div style={{ padding: 12, borderRadius: 10, background: `${color}10`, border: `1px solid ${color}30` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color, marginBottom: 6 }}>
        <AlertTriangle size={13} />{title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {issues.map((iss, i) => (
          <li key={i} style={{ fontSize: 12, color: C.sub }}>
            {iss.step_index !== undefined ? `Step ${iss.step_index + 1}: ` : ''}{iss.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepPicker({ meta, onPick, onClose }: { meta: BuilderMeta; onPick: (type: string) => void; onClose: () => void }) {
  return (
    <div className="crm-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,24,0.45)', backdropFilter: 'blur(4px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 560, padding: 20, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 750, color: C.text, marginBottom: 14 }}>Add a step</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          <button onClick={() => onPick('condition')} style={{ gridColumn: '1 / -1', textAlign: 'left', padding: 12, borderRadius: 11, cursor: 'pointer', border: `1px solid rgba(139,92,246,0.4)`, background: 'rgba(139,92,246,0.08)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <GitBranch size={16} color={C.violet} />
            <div><div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>Condition gate</div><div style={{ fontSize: 11, color: C.muted }}>Stop the workflow unless rules match</div></div>
          </button>
          {meta.actions.map((a) => (
            <button key={a.type} onClick={() => onPick(a.type)} style={{ textAlign: 'left', padding: 11, borderRadius: 11, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.5)', display: 'flex', gap: 9, alignItems: 'center' }}>
              <span style={{ color: a.color, display: 'flex' }}>{actionIcon(a.type, 15, a.color)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 650, color: C.text }}>{a.label}</div>
                <div style={{ fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
