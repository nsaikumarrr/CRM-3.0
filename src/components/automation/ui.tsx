'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, Pause, Clock, X, Loader2, AlertTriangle, Info, Archive } from 'lucide-react';

// ── Tokens ──────────────────────────────────────────────────
export const C = {
  primary: '#4f6df5',
  violet: '#8b5cf6',
  green: '#28c99a',
  red: '#f46b72',
  yellow: '#f4c95d',
  blue: '#4d7cff',
  cyan: '#28d7df',
  pink: '#ec78b5',
  gray: '#8790aa',
  text: 'var(--crm-text)',
  sub: 'var(--crm-text-secondary)',
  muted: 'var(--crm-text-muted)',
  border: 'rgba(130,145,190,0.22)',
  borderSoft: 'rgba(130,145,190,0.12)',
  panel: 'rgba(255,255,255,0.55)',
  panelStrong: 'rgba(255,255,255,0.72)',
};

// ── Helpers ─────────────────────────────────────────────────
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(start: string, end: string | null): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ── Status badge ────────────────────────────────────────────
const STATUS_META: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  active: { color: C.green, bg: 'rgba(40,201,154,0.12)', icon: <CheckCircle size={11} />, label: 'Active' },
  paused: { color: C.yellow, bg: 'rgba(244,201,93,0.12)', icon: <Pause size={11} />, label: 'Paused' },
  draft: { color: C.gray, bg: 'rgba(135,144,170,0.12)', icon: <Clock size={11} />, label: 'Draft' },
  error: { color: C.red, bg: 'rgba(244,107,114,0.12)', icon: <XCircle size={11} />, label: 'Error' },
  archived: { color: C.gray, bg: 'rgba(135,144,170,0.12)', icon: <Archive size={11} />, label: 'Archived' },
  running: { color: C.blue, bg: 'rgba(77,124,255,0.12)', icon: <Loader2 size={11} />, label: 'Running' },
  waiting: { color: C.yellow, bg: 'rgba(244,201,93,0.12)', icon: <Clock size={11} />, label: 'Waiting' },
  completed: { color: C.green, bg: 'rgba(40,201,154,0.12)', icon: <CheckCircle size={11} />, label: 'Completed' },
  failed: { color: C.red, bg: 'rgba(244,107,114,0.12)', icon: <XCircle size={11} />, label: 'Failed' },
  pending: { color: C.gray, bg: 'rgba(135,144,170,0.12)', icon: <Clock size={11} />, label: 'Queued' },
  cancelled: { color: C.gray, bg: 'rgba(135,144,170,0.12)', icon: <X size={11} />, label: 'Cancelled' },
  skipped: { color: C.gray, bg: 'rgba(135,144,170,0.12)', icon: <Info size={11} />, label: 'Skipped' },
};

export function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: small ? 10 : 11, fontWeight: 700, color: m.color, background: m.bg, borderRadius: 7, padding: small ? '2px 6px' : '3px 8px', whiteSpace: 'nowrap' }}>
      {m.icon}{m.label}
    </span>
  );
}

export function Pill({ children, color = C.gray }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color, background: `${color}18`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

// ── Buttons ─────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning';
export function Button({
  children, onClick, variant = 'secondary', disabled, loading, size = 'md', icon, type = 'button', full, title,
}: {
  children?: React.ReactNode; onClick?: () => void; variant?: BtnVariant; disabled?: boolean;
  loading?: boolean; size?: 'sm' | 'md'; icon?: React.ReactNode; type?: 'button' | 'submit'; full?: boolean; title?: string;
}) {
  const pad = size === 'sm' ? '6px 12px' : '9px 16px';
  const font = size === 'sm' ? 12 : 13;
  const styles: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: `linear-gradient(135deg,${C.primary},${C.violet})`, border: 'none', color: 'white' },
    secondary: { background: 'rgba(255,255,255,0.60)', border: `1px solid ${C.border}`, color: C.sub },
    danger: { background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.28)', color: C.red },
    ghost: { background: 'transparent', border: '1px solid transparent', color: C.muted },
    success: { background: 'rgba(40,201,154,0.12)', border: '1px solid rgba(40,201,154,0.30)', color: C.green },
    warning: { background: 'rgba(244,201,93,0.12)', border: '1px solid rgba(244,201,93,0.30)', color: C.yellow },
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: pad, borderRadius: 10, fontSize: font, fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1, width: full ? '100%' : undefined, transition: 'opacity 150ms, transform 120ms',
        ...styles[variant],
      }}
    >
      {loading ? <Loader2 size={13} className="crm-spin" /> : icon}
      {children}
    </button>
  );
}

// ── Card / Skeleton / Empty ─────────────────────────────────
export function Card({ children, style, className = 'crm-glass', onClick }: { children: React.ReactNode; style?: React.CSSProperties; className?: string; onClick?: () => void }) {
  return <div className={className} onClick={onClick} style={{ padding: '16px 18px', ...style }}>{children}</div>;
}

export function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number; width?: string | number; radius?: number; style?: React.CSSProperties }) {
  return <div style={{ height, width, borderRadius: radius, background: 'linear-gradient(90deg, rgba(130,145,190,0.12), rgba(130,145,190,0.22), rgba(130,145,190,0.12))', backgroundSize: '200% 100%', animation: 'crm-shimmer 1.4s ease-in-out infinite', ...style }} />;
}

export function EmptyState({ icon, title, message, action }: { icon?: React.ReactNode; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '44px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ opacity: 0.25 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
      {message && <div style={{ fontSize: 12.5, color: C.muted, maxWidth: 360, lineHeight: 1.5 }}>{message}</div>}
      {action}
    </div>
  );
}

// ── Form primitives ─────────────────────────────────────────
export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
      {children}{required && <span style={{ color: C.red }}> *</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
  background: 'rgba(255,255,255,0.60)', fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, style, ...rest } = props;
  return <input {...rest} style={{ ...inputStyle, borderColor: invalid ? C.red : C.border, ...style }} />;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function TextArea({ invalid, style, ...rest }, ref) {
    return <textarea ref={ref} {...rest} style={{ ...inputStyle, resize: 'vertical', minHeight: 70, borderColor: invalid ? C.red : C.border, ...style }} />;
  }
);

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, style, ...rest } = props;
  return <select {...rest} style={{ ...inputStyle, cursor: 'pointer', borderColor: invalid ? C.red : C.border, ...style }} />;
}

// ── Modal / Drawer ──────────────────────────────────────────
export function Modal({ title, subtitle, onClose, children, footer, width = 640, maxHeight = '88vh' }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number; maxHeight?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="crm-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,24,0.50)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: width, maxHeight, display: 'flex', flexDirection: 'column', padding: 0, animation: 'crm-pop 180ms ease-out' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: C.text }}>{title}</h2>
            {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 2 }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>{children}</div>
        {footer && <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.borderSoft}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children, width = 460, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; width?: number; footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="crm-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,24,0.42)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: width, height: '100%', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: 0, animation: 'crm-slide-in 200ms ease-out' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
            {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 2 }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>{children}</div>
        {footer && <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.borderSoft}`, display: 'flex', gap: 8, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, loading }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div className="crm-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,24,0.50)', backdropFilter: 'blur(5px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 420, padding: 22, animation: 'crm-pop 160ms ease-out' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: danger ? 'rgba(244,107,114,0.12)' : 'rgba(79,109,245,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} color={danger ? C.red : C.primary} />
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{title}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Toasts ──────────────────────────────────────────────────
export interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; message: string }
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, push, dismiss };
}

export function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const color = { success: C.green, error: C.red, info: C.blue };
  const icon = { success: <CheckCircle size={15} />, error: <XCircle size={15} />, info: <Info size={15} /> };
  return (
    <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
      {toasts.map((t) => (
        <div key={t.id} className="crm-glass" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderLeft: `3px solid ${color[t.kind]}`, animation: 'crm-slide-in 180ms ease-out' }}>
          <span style={{ color: color[t.kind], display: 'flex' }}>{icon[t.kind]}</span>
          <span style={{ flex: 1, fontSize: 12.5, color: C.text }}>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0 }}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
