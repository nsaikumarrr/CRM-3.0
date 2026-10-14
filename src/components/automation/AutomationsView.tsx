'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Zap, Plus, Search, RefreshCw, Play, Pause, Copy, Trash2, Pencil, Eye,
  MoreVertical, Activity, CheckCircle2, Clock, TrendingUp,
} from 'lucide-react';
import {
  C, Button, Card, Skeleton, EmptyState, StatusBadge, ConfirmDialog, Toaster, useToasts, timeAgo,
} from './ui';
import { TriggerPill } from './helpers';
import { AutomationApi, type AutomationStats, type BuilderMeta, type TemplateRow } from './api';
import { Builder } from './Builder';
import { Detail } from './Detail';
import type { AutomationRecord, WorkflowStep } from '@/lib/automation/types';

interface Props { canManage: boolean }

type BuilderState =
  | { mode: 'create'; preset?: null | { name: string; description: string; trigger_type: string; trigger_config: Record<string, unknown>; steps: WorkflowStep[] } }
  | { mode: 'edit'; data: { automation: AutomationRecord; steps: WorkflowStep[] } }
  | null;

const PAGE_SIZE = 10;

export function AutomationsView({ canManage }: Props) {
  const { toasts, push, dismiss } = useToasts();

  const [meta, setMeta] = useState<BuilderMeta | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [rows, setRows] = useState<AutomationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [trigger, setTrigger] = useState('all');
  const [page, setPage] = useState(1);

  const [menuId, setMenuId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [builder, setBuilder] = useState<BuilderState>(null);
  const [confirmDelete, setConfirmDelete] = useState<AutomationRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await AutomationApi.list({ search, status, trigger, page, pageSize: PAGE_SIZE, sort: 'updated_at', order: 'desc' });
      setRows(res.automations);
      setTotal(res.total);
    } catch (err) {
      push('error', (err as Error).message);
    } finally { setLoading(false); }
  }, [search, status, trigger, page, push]);

  const loadStats = useCallback(async () => {
    try { setStats(await AutomationApi.stats()); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [m, t] = await Promise.all([AutomationApi.meta(), AutomationApi.templates()]);
        setMeta(m); setTemplates(t.templates);
      } catch (err) { push('error', `Failed to load builder metadata: ${(err as Error).message}`); }
    })();
  }, [push]);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadList(), search ? 300 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [loadList, search]);

  useEffect(() => { setPage(1); }, [search, status, trigger]);

  const refresh = () => { loadList(); loadStats(); };

  const toggleActive = async (a: AutomationRecord) => {
    setMenuId(null);
    try {
      await AutomationApi.update(a.id, { activate: a.status !== 'active' });
      push('success', a.status === 'active' ? 'Automation paused' : 'Automation activated');
      loadList({ silent: true }); loadStats();
    } catch (err) { push('error', (err as Error).message); }
  };

  const duplicate = async (a: AutomationRecord) => {
    setMenuId(null);
    try { await AutomationApi.duplicate(a.id); push('success', 'Duplicated'); loadList({ silent: true }); loadStats(); }
    catch (err) { push('error', (err as Error).message); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await AutomationApi.remove(confirmDelete.id);
      push('success', 'Automation deleted');
      setConfirmDelete(null);
      if (detailId === confirmDelete.id) setDetailId(null);
      loadList({ silent: true }); loadStats();
    } catch (err) { push('error', (err as Error).message); }
    finally { setDeleting(false); }
  };

  const openEdit = async (a: AutomationRecord) => {
    setMenuId(null);
    try {
      const res = await AutomationApi.get(a.id);
      setBuilder({ mode: 'edit', data: { automation: res.automation, steps: res.steps } });
    } catch (err) { push('error', (err as Error).message); }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, background: `linear-gradient(135deg,${C.primary},${C.violet})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 6px 18px rgba(79,109,245,0.32)' }}>
            <Zap size={22} />
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Automations</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.muted }}>Build no-code workflows that respond to your customers automatically.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" icon={<RefreshCw size={14} />} onClick={refresh}>Refresh</Button>
          {canManage && <Button variant="primary" size="md" icon={<Plus size={15} />} onClick={() => setBuilder({ mode: 'create' })}>New automation</Button>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard icon={<Zap size={16} />} color={C.primary} label="Total" value={stats?.total} />
        <StatCard icon={<CheckCircle2 size={16} />} color={C.green} label="Active" value={stats?.active} />
        <StatCard icon={<Clock size={16} />} color={C.gray} label="Drafts" value={stats?.draft} />
        <StatCard icon={<Pause size={16} />} color={C.yellow} label="Paused" value={stats?.paused} />
        <StatCard icon={<Activity size={16} />} color={C.blue} label="Executions" value={stats?.executions.total} />
        <StatCard icon={<TrendingUp size={16} />} color={C.cyan} label="Success rate" value={stats ? `${stats.executions.successRate}%` : undefined} />
      </div>

      {/* Filters */}
      <Card style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} color={C.muted} style={{ position: 'absolute', left: 12, top: 11 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search automations…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.6)', fontSize: 13, color: C.text, boxSizing: 'border-box' }} />
        </div>
        <FilterSelect value={status} onChange={setStatus} options={[
          { value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' },
          { value: 'paused', label: 'Paused' }, { value: 'error', label: 'Error' }, { value: 'archived', label: 'Archived' },
        ]} />
        <FilterSelect value={trigger} onChange={setTrigger} options={[
          { value: 'all', label: 'All triggers' },
          ...(meta?.triggers ?? []).map((t) => ({ value: t.type, label: t.label })),
        ]} />
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={52} />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Zap size={40} />}
            title={search || status !== 'all' || trigger !== 'all' ? 'No matching automations' : 'No automations yet'}
            message={search || status !== 'all' || trigger !== 'all' ? 'Try adjusting your filters.' : 'Create your first automation to get started.'}
            action={canManage && !search && status === 'all' && trigger === 'all' ? <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setBuilder({ mode: 'create' })}>New automation</Button> : undefined}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                  {['Automation', 'Trigger', 'Status', 'Runs', 'Success', 'Last run', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 6 ? 'right' : 'left', padding: '11px 16px', fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const successRate = a.execution_count > 0 ? Math.round(((a.success_count ?? 0) / a.execution_count) * 100) : null;
                  return (
                    <tr key={a.id} className="crm-row" style={{ borderBottom: `1px solid ${C.borderSoft}`, cursor: 'pointer' }} onClick={() => setDetailId(a.id)}>
                      <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 650, color: C.text }}>{a.name}</div>
                        {a.description && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{a.description}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}><TriggerPill type={a.trigger_type} small /></td>
                      <td style={{ padding: '12px 16px' }}><StatusBadge status={a.status} small /></td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{a.execution_count ?? 0}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {successRate === null ? <span style={{ fontSize: 12, color: C.muted }}>—</span> : (
                          <span style={{ fontSize: 12.5, fontWeight: 650, color: successRate >= 80 ? C.green : successRate >= 50 ? C.yellow : C.red }}>{successRate}%</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>{timeAgo(a.last_run_at)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button onClick={() => setMenuId(menuId === a.id ? null : a.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, padding: 6, borderRadius: 8 }}>
                            <MoreVertical size={16} />
                          </button>
                          {menuId === a.id && (
                            <>
                              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuId(null)} />
                              <div className="crm-glass" style={{ position: 'absolute', right: 0, top: 30, zIndex: 50, minWidth: 176, padding: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <MenuItem icon={<Eye size={14} />} label="View details" onClick={() => { setDetailId(a.id); setMenuId(null); }} />
                                {canManage && <MenuItem icon={<Pencil size={14} />} label="Edit workflow" onClick={() => openEdit(a)} />}
                                {canManage && <MenuItem icon={a.status === 'active' ? <Pause size={14} /> : <Play size={14} />} label={a.status === 'active' ? 'Pause' : 'Activate'} onClick={() => toggleActive(a)} />}
                                {canManage && <MenuItem icon={<Copy size={14} />} label="Duplicate" onClick={() => duplicate(a)} />}
                                {canManage && <MenuItem icon={<Trash2 size={14} />} label="Delete" danger onClick={() => { setConfirmDelete(a); setMenuId(null); }} />}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${C.borderSoft}` }}>
            <span style={{ fontSize: 12, color: C.muted }}>{total} automations · page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      {builder && meta && (
        <Builder
          meta={meta}
          templates={templates}
          initial={builder.mode === 'edit' ? builder.data : null}
          preset={builder.mode === 'create' ? builder.preset ?? null : null}
          onClose={() => setBuilder(null)}
          onSaved={() => { setBuilder(null); refresh(); }}
          push={push}
        />
      )}

      {detailId && meta && (
        <Detail
          id={detailId}
          meta={meta}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onEdit={(data) => { setDetailId(null); setBuilder({ mode: 'edit', data }); }}
          onChanged={refresh}
          push={push}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete automation?"
          message={`“${confirmDelete.name}” and its execution history will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ── Small components ────────────────────────────────────────
function StatCard({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value?: number | string }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 780, color: C.text }}>{value ?? '—'}</div>
      </div>
    </Card>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.6)', fontSize: 12.5, color: C.text, cursor: 'pointer' }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: danger ? C.red : C.sub, textAlign: 'left', width: '100%' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'rgba(244,107,114,0.08)' : 'rgba(79,109,245,0.06)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {icon}{label}
    </button>
  );
}
