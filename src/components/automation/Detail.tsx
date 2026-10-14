'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Copy, Pencil, RefreshCw, CheckCircle, XCircle, Clock,
  FlaskConical, History, ListTree, Activity, Search, ChevronRight,
} from 'lucide-react';
import { C, Button, Drawer, StatusBadge, Skeleton, EmptyState, formatDate, formatDuration, timeAgo, Pill } from './ui';
import { describeStep, StepIcon, TriggerPill, actionColor } from './helpers';
import { AutomationApi, searchContacts, type BuilderMeta, type ExecutionRow, type StepLogRow, type ContactOption, type ValidationResult } from './api';
import { getTrigger } from '@/lib/automation/catalog';
import type { AutomationRecord, WorkflowStep } from '@/lib/automation/types';

interface DetailProps {
  id: string;
  meta: BuilderMeta;
  canManage: boolean;
  onClose: () => void;
  onEdit: (data: { automation: AutomationRecord; steps: WorkflowStep[] }) => void;
  onChanged: () => void;
  push: (kind: 'success' | 'error' | 'info', msg: string) => void;
}

type Tab = 'overview' | 'steps' | 'history' | 'test';

export function Detail({ id, meta, canManage, onClose, onEdit, onChanged, push }: DetailProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [automation, setAutomation] = useState<AutomationRecord | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const agentMap = useMemo(() => new Map(meta.agents.map((a) => [a.value, a.label])), [meta.agents]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AutomationApi.get(id);
      setAutomation(res.automation);
      setSteps(res.steps);
      setExecutions(res.executions);
    } catch (err) {
      push('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, push]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async () => {
    if (!automation) return;
    setBusy(true);
    try {
      const activate = automation.status !== 'active';
      const res = await AutomationApi.update(id, { activate });
      setAutomation(res.automation);
      push('success', activate ? 'Automation activated' : 'Automation paused');
      onChanged();
    } catch (err) {
      push('error', (err as Error).message);
    } finally { setBusy(false); }
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      await AutomationApi.duplicate(id);
      push('success', 'Automation duplicated');
      onChanged();
      onClose();
    } catch (err) { push('error', (err as Error).message); } finally { setBusy(false); }
  };

  const triggerDef = automation ? getTrigger(automation.trigger_type) : undefined;

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Activity size={13} /> },
    { key: 'steps', label: `Steps (${steps.length})`, icon: <ListTree size={13} /> },
    { key: 'history', label: 'History', icon: <History size={13} /> },
    { key: 'test', label: 'Test', icon: <FlaskConical size={13} /> },
  ];

  return (
    <Drawer
      title={automation?.name ?? 'Loading…'}
      subtitle={automation?.description ?? undefined}
      onClose={onClose}
      width={560}
      footer={canManage && automation ? (
        <>
          <Button variant={automation.status === 'active' ? 'warning' : 'success'} size="sm" icon={automation.status === 'active' ? <Pause size={13} /> : <Play size={13} />} loading={busy} onClick={toggleActive}>
            {automation.status === 'active' ? 'Pause' : 'Activate'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => automation && onEdit({ automation, steps })}>Edit</Button>
          <Button variant="secondary" size="sm" icon={<Copy size={13} />} loading={busy} onClick={duplicate}>Duplicate</Button>
        </>
      ) : undefined}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.borderSoft}`, paddingBottom: 4 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 650, color: tab === t.key ? C.primary : C.muted, borderBottom: `2px solid ${tab === t.key ? C.primary : 'transparent'}`, marginBottom: -5 }}>
            {t.icon}{t.label}
          </button>
        ))}
        <button onClick={load} title="Refresh" style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: C.muted, padding: 6 }}><RefreshCw size={14} /></button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={54} />)}</div>
      ) : !automation ? (
        <EmptyState icon={<XCircle size={34} />} title="Not found" message="This automation no longer exists." />
      ) : (
        <>
          {tab === 'overview' && <Overview automation={automation} triggerLabel={triggerDef?.label ?? automation.trigger_type} />}
          {tab === 'steps' && <StepsList steps={steps} agentMap={agentMap} />}
          {tab === 'history' && <HistoryPanel automationId={id} executions={executions} onRefresh={load} />}
          {tab === 'test' && <TestPanel automationId={id} />}
        </>
      )}
    </Drawer>
  );
}

function Overview({ automation, triggerLabel }: { automation: AutomationRecord; triggerLabel: string }) {
  const total = automation.execution_count ?? 0;
  const success = automation.success_count ?? 0;
  const rate = total > 0 ? Math.round((success / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StatusBadge status={automation.status} />
        <TriggerPill type={automation.trigger_type} />
        {automation.ai_enabled && <Pill color={C.violet}>AI</Pill>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <Stat label="Total runs" value={String(total)} color={C.primary} />
        <Stat label="Success rate" value={`${rate}%`} color={rate >= 80 ? C.green : rate >= 50 ? C.yellow : C.red} />
        <Stat label="Succeeded" value={String(success)} color={C.green} />
        <Stat label="Failed" value={String(automation.failure_count ?? 0)} color={C.red} />
      </div>

      <InfoRow label="Trigger" value={triggerLabel} />
      <InfoRow label="Last run" value={timeAgo(automation.last_run_at)} />
      <InfoRow label="Created" value={formatDate(automation.created_at)} />
      {automation.last_error && (
        <div style={{ padding: 10, borderRadius: 9, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', fontSize: 12, color: C.red }}>
          Last error: {automation.last_error}
        </div>
      )}
      {automation.description && (
        <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.5)' }}>{automation.description}</div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 11, background: 'rgba(255,255,255,0.55)', border: `1px solid ${C.borderSoft}` }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 750, color, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.text, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StepsList({ steps, agentMap }: { steps: WorkflowStep[]; agentMap: Map<string, string> }) {
  if (steps.length === 0) return <EmptyState icon={<ListTree size={32} />} title="No steps" message="This workflow has no steps." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {steps.map((step, i) => {
        const { title, detail } = describeStep(step, agentMap);
        const color = step.step_type === 'condition' ? C.violet : actionColor(step.step_type);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 12px', borderRadius: 11, border: `1px solid ${C.borderSoft}`, background: 'rgba(255,255,255,0.5)' }}>
            <StepIcon step={step} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color }}>#{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 650, color: C.text }}>{title}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryPanel({ automationId, executions, onRefresh }: { automationId: string; executions: ExecutionRow[]; onRefresh: () => void }) {
  const [status, setStatus] = useState('all');
  const [rows, setRows] = useState<ExecutionRow[]>(executions);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutionRow | null>(null);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    try {
      const res = await AutomationApi.executions(automationId, { status: s, pageSize: 30 });
      setRows(res.executions);
    } finally { setLoading(false); }
  }, [automationId]);

  useEffect(() => { load(status); }, [status, load]);

  const openDetail = async (execId: string) => {
    if (openId === execId) { setOpenId(null); setDetail(null); return; }
    setOpenId(execId);
    try {
      const res = await AutomationApi.executionDetail(automationId, execId);
      setDetail(res.execution);
    } catch { setDetail(null); }
  };

  const STATUSES = ['all', 'completed', 'failed', 'waiting', 'running'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.6)', fontSize: 12, color: C.text }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
        <button onClick={() => { onRefresh(); load(status); }} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: C.muted }}><RefreshCw size={14} /></button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={46} />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<History size={30} />} title="No executions yet" message="Runs will appear here once the automation is triggered." />
      ) : (
        rows.map((ex) => (
          <div key={ex.id} style={{ borderRadius: 11, border: `1px solid ${C.borderSoft}`, overflow: 'hidden', background: 'rgba(255,255,255,0.5)' }}>
            <button onClick={() => openDetail(ex.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <ChevronRight size={14} color={C.muted} style={{ transform: openId === ex.id ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
              <StatusBadge status={ex.status} small />
              <span style={{ fontSize: 12, color: C.sub, flex: 1 }}>{formatDate(ex.started_at)}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{ex.current_step}/{ex.total_steps} steps</span>
              <span style={{ fontSize: 11, color: C.muted }}>{formatDuration(ex.started_at, ex.completed_at)}</span>
            </button>
            {openId === ex.id && (
              <div style={{ padding: '4px 12px 12px 36px', borderTop: `1px solid ${C.borderSoft}` }}>
                {detail?.steps_log ? (
                  <StepLogList logs={detail.steps_log} />
                ) : <Skeleton height={40} style={{ marginTop: 8 }} />}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function StepLogList({ logs }: { logs: StepLogRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
      {logs.map((log, i) => {
        const color = log.status === 'completed' ? C.green : log.status === 'failed' ? C.red : C.gray;
        const Icon = log.status === 'completed' ? CheckCircle : log.status === 'failed' ? XCircle : Clock;
        return (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon size={13} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 11.5, fontWeight: 650, color: C.text }}>{log.step_type}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}> — {log.detail}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TestPanel({ automationId }: { automationId: string }) {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [selected, setSelected] = useState<ContactOption | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ validation: ValidationResult; simulation?: { steps_log: StepLogRow[]; note: string }; error?: string } | null>(null);
  const [execResult, setExecResult] = useState<{ steps_log: StepLogRow[]; status: string; error_message: string | null } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try { setContacts(await searchContacts(query)); } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const runSimulation = async () => {
    setRunning(true); setExecResult(null);
    try { setResult(await AutomationApi.test(automationId, selected ? { mode: 'simulate', contactId: selected.id } : { mode: 'validate' })); }
    catch (err) { setResult({ validation: { valid: false, errors: [], warnings: [] }, error: (err as Error).message }); }
    finally { setRunning(false); }
  };

  const runReal = async () => {
    if (!selected) return;
    setRunning(true); setResult(null);
    try {
      const res = await AutomationApi.execute(automationId, { contactId: selected.id });
      setExecResult({ steps_log: res.steps_log ?? [], status: res.status, error_message: res.error_message });
    } catch (err) { setExecResult({ steps_log: [], status: 'failed', error_message: (err as Error).message }); }
    finally { setRunning(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
        Simulate without side effects, or run a real execution against a chosen contact.
      </div>

      <div>
        <div style={{ position: 'relative' }}>
          <Search size={14} color={C.muted} style={{ position: 'absolute', left: 11, top: 11 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a contact by name, phone or email"
            style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.6)', fontSize: 12.5, color: C.text, boxSizing: 'border-box' }} />
        </div>
        {contacts.length > 0 && (
          <div style={{ marginTop: 6, maxHeight: 150, overflowY: 'auto', borderRadius: 10, border: `1px solid ${C.borderSoft}` }}>
            {contacts.map((c) => (
              <button key={c.id} onClick={() => { setSelected(c); setContacts([]); setQuery(c.name ?? c.phone ?? c.email ?? ''); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: C.sub, borderBottom: `1px solid ${C.borderSoft}` }}>
                {c.name ?? '(no name)'} {c.phone && <span style={{ color: C.muted }}>· {c.phone}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <Pill color={C.green}>Selected: {selected.name ?? selected.phone ?? selected.id.slice(0, 8)}</Pill>}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" size="sm" icon={<FlaskConical size={13} />} loading={running} onClick={runSimulation}>Simulate</Button>
        <Button variant="primary" size="sm" icon={<Play size={13} />} loading={running} disabled={!selected} onClick={runReal}>Run for real</Button>
      </div>

      {result?.error && <ErrorBox message={result.error} />}
      {result && !result.error && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Simulation result</div>
          <StepLogList logs={result.simulation?.steps_log ?? []} />
        </div>
      )}

      {execResult && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Execution result</span>
            <StatusBadge status={execResult.status} small />
          </div>
          {execResult.error_message && <ErrorBox message={execResult.error_message} />}
          <StepLogList logs={execResult.steps_log} />
        </div>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ padding: 10, borderRadius: 9, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', fontSize: 12, color: C.red, display: 'flex', gap: 7 }}>
      <XCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{message}
    </div>
  );
}
