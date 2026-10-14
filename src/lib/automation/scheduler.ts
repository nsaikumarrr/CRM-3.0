/**
 * CRM 3.0 — Automation background scheduler.
 *
 * Invoked by the cron worker (see vercel.json + /api/v3/automations/scheduler).
 * Two responsibilities:
 *   1. Resume executions paused on `wait` steps (durable jobs).
 *   2. Fire scheduled triggers (recurring, inactivity, follow-up due,
 *      unanswered conversation).
 *
 * Uses a service-role client so it works without a user session. Falls back
 * to the request client when service credentials are absent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AutomationRecord } from './types';
import { runAutomation } from './engine';
import { dispatchEvent } from './dispatcher';

type Db = SupabaseClient;

const BATCH = 50;
const LOCK_MS = 60_000;

export interface SchedulerSummary {
  resumed: number;
  failedJobs: number;
  deadLettered: number;
  scheduledTriggersFired: number;
  details: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

function intervalMs(cfg: Record<string, unknown>): number {
  const every = Number(cfg.every) || 1;
  const unit = String(cfg.unit ?? 'days');
  const factor = unit === 'minutes' ? 60_000 : unit === 'hours' ? 3_600_000 : unit === 'weeks' ? 604_800_000 : 86_400_000;
  return Math.max(60_000, every * factor);
}

/** Resume executions paused on a wait step. */
async function resumeDueJobs(db: Db, summary: SchedulerSummary): Promise<void> {
  const now = nowIso();
  const lockExpiry = new Date(Date.now() - LOCK_MS).toISOString();

  const { data: jobs, error } = await db
    .from('crm3_automation_scheduled_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', now)
    .or(`lock_until.is.null,lock_until.lt.${lockExpiry}`)
    .limit(BATCH);

  if (error) {
    summary.details.push(`job fetch failed: ${error.message}`);
    return;
  }

  for (const job of jobs ?? []) {
    const lockUntil = new Date(Date.now() + LOCK_MS).toISOString();
    const { data: locked } = await db
      .from('crm3_automation_scheduled_jobs')
      .update({ status: 'running', lock_until: lockUntil, attempts: (job.attempts ?? 0) + 1, updated_at: now })
      .eq('id', job.id)
      .or(`lock_until.is.null,lock_until.lt.${lockExpiry}`)
      .select('id')
      .maybeSingle();

    if (!locked) continue; // another worker took it

    try {
      const { data: automation } = await db.from('automations').select('*').eq('id', job.automation_id).single();
      if (!automation) {
        await db.from('crm3_automation_scheduled_jobs').update({ status: 'failed', last_error: 'Automation not found', lock_until: null }).eq('id', job.id);
        summary.failedJobs++;
        continue;
      }

      const result = await runAutomation({
        db,
        accountId: job.account_id,
        automation: automation as AutomationRecord,
        triggerType: (automation as AutomationRecord).trigger_type,
        triggerData: (job.payload?.trigger_data as Record<string, unknown>) ?? {},
        contactId: job.contact_id,
        conversationId: job.conversation_id,
        executionId: job.execution_id,
        startStepIndex: job.next_step_index ?? 0,
      });

      if (result.status === 'failed') {
        const attempts = (job.attempts ?? 0) + 1;
        const max = job.max_attempts ?? 3;
        if (attempts >= max) {
          await db.from('crm3_automation_scheduled_jobs')
            .update({ status: 'failed', last_error: result.errorMessage, lock_until: null })
            .eq('id', job.id);
          summary.deadLettered++;
        } else {
          const backoff = Math.pow(2, attempts) * 60_000;
          await db.from('crm3_automation_scheduled_jobs')
            .update({ status: 'pending', run_at: new Date(Date.now() + backoff).toISOString(), last_error: result.errorMessage, lock_until: null })
            .eq('id', job.id);
          summary.failedJobs++;
        }
      } else {
        await db.from('crm3_automation_scheduled_jobs')
          .update({ status: 'completed', lock_until: null })
          .eq('id', job.id);
        summary.resumed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.from('crm3_automation_scheduled_jobs').update({ status: 'pending', lock_until: null, last_error: msg }).eq('id', job.id);
      summary.failedJobs++;
      summary.details.push(`resume error: ${msg}`);
    }
  }
}

/** Fire scheduled-trigger automations. */
async function runScheduledTriggers(db: Db, summary: SchedulerSummary): Promise<void> {
  const { data: automations } = await db
    .from('automations')
    .select('*')
    .eq('status', 'active')
    .eq('is_active', true)
    .in('trigger_type', ['time_based', 'inactivity', 'follow_up_due', 'conversation_unanswered']);

  const now = Date.now();

  for (const automation of (automations ?? []) as AutomationRecord[]) {
    const accountId = automation.account_id;
    const cfg = automation.trigger_config ?? {};

    if (automation.trigger_type === 'time_based') {
      const next = automation.next_run_at ? new Date(automation.next_run_at).getTime() : 0;
      if (next > now) continue;
      const key = `time_based:${automation.id}:${dayBucket()}`;
      const res = await dispatchEvent(db, accountId, { event_type: 'time_based', event_key: key });
      if (!res.duplicate) summary.scheduledTriggersFired += res.triggered;
      await db.from('automations')
        .update({ next_run_at: new Date(now + intervalMs(cfg)).toISOString() })
        .eq('id', automation.id);
      continue;
    }

    if (automation.trigger_type === 'inactivity') {
      const days = Number(cfg.days) || 30;
      const cutoff = new Date(now - days * 86_400_000).toISOString();
      const { data: contacts } = await db
        .from('contacts')
        .select('id, last_customer_reply_at, updated_at')
        .eq('account_id', accountId)
        .or(`last_customer_reply_at.lt.${cutoff},last_customer_reply_at.is.null`)
        .lt('updated_at', cutoff)
        .limit(BATCH);
      for (const c of contacts ?? []) {
        const key = `inactivity:${automation.id}:${c.id}:${dayBucket()}`;
        const res = await dispatchEvent(db, accountId, {
          event_type: 'inactivity',
          event_key: key,
          contact_id: c.id,
          payload: { last_interaction_at: c.last_customer_reply_at ?? c.updated_at },
        });
        if (!res.duplicate) summary.scheduledTriggersFired += res.triggered;
      }
      continue;
    }

    if (automation.trigger_type === 'follow_up_due') {
      const { data: followUps } = await db
        .from('follow_ups')
        .select('id, contact_id, due_date')
        .eq('account_id', accountId)
        .eq('status', 'pending')
        .lte('due_date', nowIso())
        .limit(BATCH);
      for (const f of followUps ?? []) {
        const key = `follow_up_due:${automation.id}:${f.id}`;
        const res = await dispatchEvent(db, accountId, {
          event_type: 'follow_up_due',
          event_key: key,
          contact_id: f.contact_id,
          payload: { follow_up_id: f.id, due_date: f.due_date },
        });
        if (!res.duplicate) summary.scheduledTriggersFired += res.triggered;
      }
      continue;
    }

    if (automation.trigger_type === 'conversation_unanswered') {
      const hours = Number(cfg.hours) || 24;
      const cutoff = new Date(now - hours * 3_600_000).toISOString();
      const { data: conversations } = await db
        .from('conversations')
        .select('id, contact_id, last_message_at')
        .eq('account_id', accountId)
        .eq('status', 'open')
        .gt('unread_count', 0)
        .lt('last_message_at', cutoff)
        .limit(BATCH);
      for (const c of conversations ?? []) {
        const key = `conversation_unanswered:${automation.id}:${c.id}:${dayBucket()}`;
        const res = await dispatchEvent(db, accountId, {
          event_type: 'conversation_unanswered',
          event_key: key,
          contact_id: c.contact_id,
          conversation_id: c.id,
          payload: { last_message_at: c.last_message_at },
        });
        if (!res.duplicate) summary.scheduledTriggersFired += res.triggered;
      }
    }
  }
}

export async function runAutomationScheduler(db: Db): Promise<SchedulerSummary> {
  const summary: SchedulerSummary = {
    resumed: 0,
    failedJobs: 0,
    deadLettered: 0,
    scheduledTriggersFired: 0,
    details: [],
  };
  await resumeDueJobs(db, summary);
  await runScheduledTriggers(db, summary);
  return summary;
}
