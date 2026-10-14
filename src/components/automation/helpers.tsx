'use client';

import React from 'react';
import {
  MessageSquare, Heart, List, Tag, UserPlus, TrendingUp, CalendarPlus,
  StickyNote, Clock, Webhook, Flag, Users, DollarSign, Plug, Zap, GitBranch, Sparkles,
} from 'lucide-react';
import { C } from './ui';
import { summarizeRule } from '@/lib/automation/conditions';
import { getTrigger, getAction, CHANNELS, LEAD_STATUSES } from '@/lib/automation/catalog';
import type { WorkflowStep, ConditionConfig, TriggerCategory } from '@/lib/automation/types';

// ── Icons ───────────────────────────────────────────────────
const ACTION_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  MessageSquare, Heart, List, Tag, TagOff: Tag, UserPlus, TrendingUp, CalendarPlus, StickyNote, Clock, Webhook, Flag,
};

export function actionIcon(type: string, size = 16, color?: string) {
  const Icon = ACTION_ICONS[getAction(type)?.icon ?? 'MessageSquare'] ?? MessageSquare;
  return <Icon size={size} color={color} />;
}

const CATEGORY_META: Record<TriggerCategory, { icon: React.ComponentType<{ size?: number; color?: string }>; color: string }> = {
  contact: { icon: Users, color: C.green },
  lead: { icon: TrendingUp, color: C.yellow },
  conversation: { icon: MessageSquare, color: C.blue },
  sales: { icon: DollarSign, color: C.primary },
  time: { icon: Clock, color: C.cyan },
  integration: { icon: Plug, color: C.pink },
};

export function triggerMeta(type: string) {
  const def = getTrigger(type);
  const cat = CATEGORY_META[def?.category ?? 'contact'];
  return { def, icon: cat.icon, color: cat.color };
}

export function triggerIcon(type: string, size = 16, color?: string) {
  const { icon: Icon, color: cc } = triggerMeta(type);
  return <Icon size={size} color={color ?? cc} />;
}

export function actionColor(type: string): string {
  return getAction(type)?.color ?? C.primary;
}

export function channelLabel(value: unknown): string {
  return (CHANNELS ?? []).find((c) => c.value === value)?.label ?? String(value ?? '');
}
export function leadStatusLabel(value: unknown): string {
  return (LEAD_STATUSES ?? []).find((s) => s.value === value)?.label ?? String(value ?? '');
}

// ── Step descriptions ───────────────────────────────────────
function truncate(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function describeStep(step: WorkflowStep, agentMap?: Map<string, string>): { title: string; detail: string } {
  const cfg = (step.config ?? {}) as Record<string, unknown>;

  if (step.step_type === 'condition') {
    const c = cfg as unknown as ConditionConfig;
    const rules = c.rules ?? [];
    const head = c.match === 'any' ? 'If ANY of' : 'If ALL';
    return {
      title: 'Condition gate',
      detail: rules.length ? `${head}: ${rules.map((r) => summarizeRule(r)).join(c.match === 'any' ? ' OR ' : ' AND ')}` : 'No rules yet',
    };
  }

  const action = getAction(step.step_type);
  const label = action?.label ?? step.step_type;

  switch (step.step_type) {
    case 'send_message':
    case 'send_welcome_message':
      return { title: label, detail: `${channelLabel(cfg.channel)}: “${truncate(String(cfg.message ?? ''))}”` };
    case 'send_list':
      return { title: label, detail: `${channelLabel(cfg.channel)} — ${truncate(String(cfg.message ?? ''))}` };
    case 'add_tag':
    case 'remove_tag':
      return { title: label, detail: `“${cfg.tag ?? ''}”` };
    case 'assign_contact':
      return { title: label, detail: agentMap?.get(String(cfg.assignee_id)) ?? 'Unassigned' };
    case 'update_lead_status':
      return { title: label, detail: `→ ${leadStatusLabel(cfg.status)}` };
    case 'create_follow_up':
      return { title: label, detail: `${cfg.title ?? 'Follow up'} (due in ${cfg.days ?? 1} day(s))` };
    case 'add_note':
      return { title: label, detail: truncate(String(cfg.note ?? '')) };
    case 'wait':
      return { title: label, detail: `${cfg.amount ?? 1} ${cfg.unit ?? 'hours'}` };
    case 'webhook':
      return { title: label, detail: `${cfg.method ?? 'POST'} ${truncate(String(cfg.url ?? ''), 44)}` };
    case 'end_workflow':
      return { title: label, detail: 'Stops the workflow' };
    default:
      return { title: label, detail: '' };
  }
}

export function TriggerPill({ type, small }: { type: string; small?: boolean }) {
  const { def, icon: Icon, color } = triggerMeta(type);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: small ? 11 : 12, fontWeight: 650, color: C.text }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: small ? 20 : 24, height: small ? 20 : 24, borderRadius: 7, background: `${color}1e`, color }}>
        <Icon size={small ? 12 : 14} />
      </span>
      {def?.label ?? type}
    </span>
  );
}

export function StepIcon({ step, size = 30 }: { step: WorkflowStep; size?: number }) {
  const color = step.step_type === 'condition' ? C.violet : actionColor(step.step_type);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: 9, background: `${color}1e`, color, flexShrink: 0 }}>
      {step.step_type === 'condition' ? <GitBranch size={size * 0.55} /> : actionIcon(step.step_type, size * 0.55, color)}
    </span>
  );
}

export function CategoryChip({ category, label }: { category: TriggerCategory; label: string }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 6, padding: '2px 7px' }}>
      <Icon size={10} />{label}
    </span>
  );
}

export const SpecialIcons = { Zap, Sparkles, GitBranch, Users, Clock };
