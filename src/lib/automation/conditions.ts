/**
 * CRM 3.0 — Condition engine (pure, dependency-free).
 *
 * This module is intentionally free of runtime imports so it can be
 * unit-tested with `node --test` and reused on the client without
 * pulling server code. All evaluation is closed-form: user supplied
 * values are only ever compared against a whitelist of fields and
 * operators. No expressions, no eval.
 */

import type {
  ConditionFieldDef,
  ConditionOperator,
  ConditionConfig,
  ConditionRule,
  ExecutionContext,
} from './types';

export const CONDITION_FIELDS: ConditionFieldDef[] = [
  { key: 'contact.source', label: 'Contact source', group: 'Contact', type: 'text' },
  { key: 'contact.tags', label: 'Contact tags', group: 'Contact', type: 'tags' },
  { key: 'contact.lead_status', label: 'Lead status', group: 'Contact',
    type: 'select',
    options: [
      { value: 'new', label: 'New' },
      { value: 'contacted', label: 'Contacted' },
      { value: 'qualified', label: 'Qualified' },
      { value: 'proposal', label: 'Proposal' },
      { value: 'negotiation', label: 'Negotiation' },
      { value: 'won', label: 'Won' },
      { value: 'lost', label: 'Lost' },
    ] },
  { key: 'contact.lead_score', label: 'Lead score', group: 'Contact', type: 'number' },
  { key: 'contact.name', label: 'Contact name', group: 'Contact', type: 'text' },
  { key: 'contact.email', label: 'Contact email', group: 'Contact', type: 'text' },
  { key: 'contact.company', label: 'Contact company', group: 'Contact', type: 'text' },

  { key: 'conversation.platform', label: 'Channel', group: 'Conversation', type: 'select',
    options: [
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'email', label: 'Email' },
      { value: 'telegram', label: 'Telegram' },
      { value: 'web', label: 'Web' },
    ] },
  { key: 'conversation.status', label: 'Conversation status', group: 'Conversation', type: 'select',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'pending', label: 'Pending' },
      { value: 'resolved', label: 'Resolved' },
      { value: 'snoozed', label: 'Snoozed' },
    ] },
  { key: 'conversation.priority', label: 'Conversation priority', group: 'Conversation', type: 'select',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
      { value: 'urgent', label: 'Urgent' },
    ] },

  { key: 'message.content', label: 'Message content', group: 'Message', type: 'text' },
  { key: 'message.is_first', label: 'Is first message', group: 'Message', type: 'boolean' },

  { key: 'deal.value', label: 'Deal value', group: 'Deal', type: 'number' },
  { key: 'deal.status', label: 'Deal status', group: 'Deal', type: 'select',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'won', label: 'Won' },
      { value: 'lost', label: 'Lost' },
    ] },

  { key: 'time.since_last_interaction_hours', label: 'Hours since last interaction', group: 'Time', type: 'number' },
];

export interface OperatorDef {
  value: ConditionOperator;
  label: string;
  types: ConditionFieldDef['type'][];
  /** Operators that require no comparison value. */
  noValue?: boolean;
  /** Operators whose value is a list. */
  listValue?: boolean;
}

export const OPERATORS: OperatorDef[] = [
  { value: 'equals', label: 'is', types: ['text', 'number', 'select', 'boolean', 'tags'] },
  { value: 'not_equals', label: 'is not', types: ['text', 'number', 'select', 'boolean', 'tags'] },
  { value: 'contains', label: 'contains', types: ['text', 'tags'] },
  { value: 'not_contains', label: 'does not contain', types: ['text', 'tags'] },
  { value: 'starts_with', label: 'starts with', types: ['text'] },
  { value: 'greater_than', label: '>', types: ['number'] },
  { value: 'less_than', label: '<', types: ['number'] },
  { value: 'greater_or_equal', label: '≥', types: ['number'] },
  { value: 'less_or_equal', label: '≤', types: ['number'] },
  { value: 'in', label: 'is one of', types: ['text', 'select', 'tags'], listValue: true },
  { value: 'not_in', label: 'is none of', types: ['text', 'select', 'tags'], listValue: true },
  { value: 'is_set', label: 'is set', types: ['text', 'number', 'select', 'boolean', 'tags', 'datetime'], noValue: true },
  { value: 'is_not_set', label: 'is not set', types: ['text', 'number', 'select', 'boolean', 'tags', 'datetime'], noValue: true },
  { value: 'before', label: 'is before', types: ['datetime'] },
  { value: 'after', label: 'is after', types: ['datetime'] },
  { value: 'within_days', label: 'is within last (days)', types: ['datetime', 'number'] },
];

export function getFieldDef(key: string): ConditionFieldDef | undefined {
  return CONDITION_FIELDS.find((f) => f.key === key);
}

export function operatorsForType(type: ConditionFieldDef['type']): OperatorDef[] {
  return OPERATORS.filter((o) => o.types.includes(type));
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') return v.split(',').map((s) => s.trim());
  return [];
}

function toComparableList(v: unknown): string[] {
  return asArray(v).map((x) => asString(x).toLowerCase());
}

/** Resolve the runtime value of a condition field from an execution context. */
export function resolveFieldValue(
  field: string,
  ctx: ExecutionContext
): unknown {
  const [scope, key] = field.split('.');
  const trigger = ctx.trigger_data ?? {};

  if (field === 'time.since_last_interaction_hours') {
    const last =
      (ctx.contact?.last_customer_reply_at as string | undefined) ??
      (ctx.conversation?.last_message_at as string | undefined) ??
      (trigger.last_interaction_at as string | undefined);
    if (!last) return null;
    const diff = Date.now() - new Date(last).getTime();
    return Math.max(0, diff / 3_600_000);
  }

  switch (scope) {
    case 'contact':
      return (ctx.contact as Record<string, unknown> | null | undefined)?.[key];
    case 'conversation':
      return (ctx.conversation as Record<string, unknown> | null | undefined)?.[key];
    case 'deal':
      return (ctx.deal as Record<string, unknown> | null | undefined)?.[key];
    case 'message':
      return (ctx.message as Record<string, unknown> | null | undefined)?.[key];
    case 'time':
      return trigger[key];
    default:
      return undefined;
  }
}

function isSet(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Evaluate a single rule against a resolved field value. */
export function evaluateRule(rule: ConditionRule, value: unknown): boolean {
  const op = rule.operator;

  if (op === 'is_set') return isSet(value);
  if (op === 'is_not_set') return !isSet(value);

  if (op === 'greater_than' || op === 'less_than' || op === 'greater_or_equal' || op === 'less_or_equal') {
    const a = asNumber(value);
    const b = asNumber(rule.value);
    if (a === null || b === null) return false;
    if (op === 'greater_than') return a > b;
    if (op === 'less_than') return a < b;
    if (op === 'greater_or_equal') return a >= b;
    return a <= b;
  }

  if (op === 'before' || op === 'after') {
    const a = value ? new Date(asString(value)).getTime() : NaN;
    const b = rule.value ? new Date(asString(rule.value)).getTime() : NaN;
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return op === 'before' ? a < b : a > b;
  }

  if (op === 'within_days') {
    const a = value ? new Date(asString(value)).getTime() : NaN;
    const days = asNumber(rule.value);
    if (Number.isNaN(a) || days === null) return false;
    const diffDays = (Date.now() - a) / 86_400_000;
    return diffDays >= 0 && diffDays <= days;
  }

  if (op === 'in' || op === 'not_in') {
    const list = toComparableList(rule.value);
    const candidates = Array.isArray(value)
      ? value.map((v) => asString(v).toLowerCase())
      : [asString(value).toLowerCase()];
    const found = candidates.some((c) => list.includes(c));
    return op === 'in' ? found : !found;
  }

  if (op === 'contains' || op === 'not_contains') {
    if (Array.isArray(value)) {
      const needle = asString(rule.value).toLowerCase();
      const has = value.some((v) => asString(v).toLowerCase() === needle);
      return op === 'contains' ? has : !has;
    }
    const hay = asString(value).toLowerCase();
    const needle = asString(rule.value).toLowerCase();
    const has = needle === '' ? false : hay.includes(needle);
    return op === 'contains' ? has : !has;
  }

  if (op === 'starts_with') {
    return asString(value).toLowerCase().startsWith(asString(rule.value).toLowerCase());
  }

  if (op === 'equals' || op === 'not_equals') {
    let eq: boolean;
    if (Array.isArray(value)) {
      eq = toComparableList(value).includes(asString(rule.value).toLowerCase());
    } else if (typeof value === 'number' || typeof rule.value === 'number') {
      eq = asNumber(value) === asNumber(rule.value);
    } else {
      eq = asString(value).toLowerCase() === asString(rule.value).toLowerCase();
    }
    return op === 'equals' ? eq : !eq;
  }

  return false;
}

/**
 * Evaluate a condition block. An empty rule set always passes (no gating).
 */
export function evaluateConditions(
  config: ConditionConfig | null | undefined,
  ctx: ExecutionContext
): { passed: boolean; results: { rule: ConditionRule; value: unknown; passed: boolean }[] } {
  const rules = config?.rules ?? [];
  if (rules.length === 0) return { passed: true, results: [] };

  const results = rules.map((rule) => {
    const value = resolveFieldValue(rule.field, ctx);
    return { rule, value, passed: evaluateRule(rule, value) };
  });

  const match = config?.match === 'any' ? 'any' : 'all';
  const passed = match === 'any' ? results.some((r) => r.passed) : results.every((r) => r.passed);
  return { passed, results };
}

/** Validate a single rule against the whitelist. */
export function validateRule(rule: ConditionRule): string | null {
  const field = getFieldDef(rule.field);
  if (!field) return `Unknown condition field "${rule.field}"`;
  const op = OPERATORS.find((o) => o.value === rule.operator);
  if (!op) return `Unknown operator "${rule.operator}"`;
  if (!op.types.includes(field.type)) {
    return `Operator "${op.label}" is not valid for "${field.label}"`;
  }
  if (!op.noValue && (rule.value === undefined || rule.value === null || rule.value === '')) {
    return `A value is required for "${field.label}"`;
  }
  return null;
}

/** Human readable summary used in the builder and detail views. */
export function summarizeRule(rule: ConditionRule): string {
  const field = getFieldDef(rule.field);
  const op = OPERATORS.find((o) => o.value === rule.operator);
  const fieldLabel = field?.label ?? rule.field;
  const opLabel = op?.label ?? rule.operator;
  if (op?.noValue) return `${fieldLabel} ${opLabel}`;
  const value = Array.isArray(rule.value) ? rule.value.join(', ') : asString(rule.value);
  return `${fieldLabel} ${opLabel} ${value}`;
}
