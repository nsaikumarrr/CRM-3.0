/**
 * CRM 3.0 — Automation trigger dispatcher.
 *
 * Accepts a normalised CRM event, deduplicates it with an idempotency key,
 * finds active automations bound to the event, evaluates each trigger's
 * configuration filter and executes the workflow.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AutomationRecord } from './types';
import { runAutomation } from './engine';

type Db = SupabaseClient;

export interface AutomationEvent {
  event_type: string;
  /** Stable idempotency key. Duplicate deliveries re-use the same key. */
  event_key: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  deal_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface DispatchResult {
  duplicate: boolean;
  triggered: number;
  skipped: number;
  executions: { automation_id: string; execution_id: string | null; status: string }[];
}

/** Build a deterministic key so redelivered events are ignored. */
export function makeEventKey(eventType: string, objectId: string, version?: string | number): string {
  return `${eventType}:${objectId}:${version ?? ''}`;
}

function asString(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** Apply the trigger's own configuration filter (keyword, tag, channel...). */
async function matchesTrigger(
  db: Db,
  accountId: string,
  automation: AutomationRecord,
  event: AutomationEvent
): Promise<boolean> {
  const cfg = automation.trigger_config ?? {};
  const payload = event.payload ?? {};

  switch (automation.trigger_type) {
    case 'keyword_match': {
      const keywords = asString(cfg.keywords).toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
      if (keywords.length === 0) return false;
      const text = asString(payload.message ?? payload.text).toLowerCase();
      if (!text) return false;
      const exact = cfg.match === 'exact';
      return exact
        ? keywords.some((k) => text.split(/\s+/).includes(k))
        : keywords.some((k) => text.includes(k));
    }
    case 'message_received': {
      if (!cfg.channel) return true;
      return asString(payload.channel) === asString(cfg.channel);
    }
    case 'contact_tagged': {
      const tag = asString(cfg.tag).toLowerCase();
      if (!tag) return true;
      const tags = Array.isArray(payload.tags) ? (payload.tags as unknown[]).map((t) => asString(t).toLowerCase()) : [];
      return tags.includes(tag) || asString(payload.tag).toLowerCase() === tag;
    }
    case 'lead_status_changed': {
      if (!cfg.to) return true;
      return asString(payload.to) === asString(cfg.to);
    }
    case 'lead_score_changed': {
      const score = Number(payload.score);
      const threshold = Number(cfg.threshold);
      if (!Number.isFinite(score) || !Number.isFinite(threshold)) return false;
      return cfg.operator === 'less_than' ? score < threshold : score > threshold;
    }
    default:
      return true;
  }
}

export async function dispatchEvent(db: Db, accountId: string, event: AutomationEvent): Promise<DispatchResult> {
  // 1. Claim the event (idempotency).
  const claim = await db
    .from('crm3_automation_events')
    .insert({
      account_id: accountId,
      event_key: event.event_key,
      event_type: event.event_type,
      contact_id: event.contact_id ?? null,
      payload: event.payload ?? {},
      status: 'processing',
    })
    .select('id')
    .single();

  if (claim.error) {
    const msg = claim.error.message ?? '';
    if (/duplicate|unique|conflict/i.test(msg)) {
      return { duplicate: true, triggered: 0, skipped: 0, executions: [] };
    }
    console.error('[dispatch] event claim failed:', msg);
    return { duplicate: false, triggered: 0, skipped: 0, executions: [] };
  }
  const eventId = claim.data?.id as string | undefined;

  // 2. Find matching active automations.
  const { data: automations } = await db
    .from('automations')
    .select('*')
    .eq('account_id', accountId)
    .eq('trigger_type', event.event_type)
    .eq('status', 'active')
    .eq('is_active', true);

  const executions: DispatchResult['executions'] = [];
  let skipped = 0;

  for (const automation of (automations ?? []) as AutomationRecord[]) {
    try {
      if (!(await matchesTrigger(db, accountId, automation, event))) {
        skipped++;
        continue;
      }
      const result = await runAutomation({
        db,
        accountId,
        automation,
        triggerType: event.event_type,
        triggerData: { ...(event.payload ?? {}), account_id: accountId },
        contactId: event.contact_id ?? null,
        conversationId: event.conversation_id ?? null,
        dealId: event.deal_id ?? null,
      });
      executions.push({ automation_id: automation.id, execution_id: result.executionId, status: result.status });
    } catch (err) {
      console.error('[dispatch] automation failed:', err);
      skipped++;
    }
  }

  if (eventId) {
    await db
      .from('crm3_automation_events')
      .update({
        status: executions.length > 0 ? 'completed' : 'skipped',
        executions_created: executions.length,
      })
      .eq('id', eventId);
  }

  return { duplicate: false, triggered: executions.length, skipped, executions };
}
