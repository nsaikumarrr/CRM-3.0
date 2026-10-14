/**
 * CRM 3.0 — Automation execution engine.
 *
 * Responsible for running a saved workflow: loading context, evaluating
 * condition gates, executing action handlers, persisting step-by-step
 * execution records and scheduling durable delays.
 *
 * Nothing here depends on a browser being open. Delays are persisted to
 * `crm3_automation_scheduled_jobs` and resumed by the cron worker.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AutomationRecord,
  ConditionConfig,
  ExecutionContext,
  StepLog,
  WorkflowStep,
} from './types';
import { evaluateConditions } from './conditions';
import { executeAction } from './actions';

type Db = SupabaseClient;

export interface RunParams {
  db: Db;
  accountId: string;
  automation: AutomationRecord;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  contactId?: string | null;
  conversationId?: string | null;
  dealId?: string | null;
  /** Resume support: index of the first step to run. */
  startStepIndex?: number;
  /** Resume support: reuse an existing execution row instead of creating one. */
  executionId?: string | null;
  /** Test/simulation: do not perform side effects. */
  simulate?: boolean;
  /** Pre-loaded steps (used by the scheduler to avoid a re-fetch). */
  steps?: WorkflowStep[];
}

export interface RunResult {
  executionId: string | null;
  status: 'completed' | 'failed' | 'waiting';
  stepsLog: StepLog[];
  errorMessage: string | null;
  simulated: boolean;
}

async function loadSteps(db: Db, automationId: string): Promise<WorkflowStep[]> {
  const { data } = await db
    .from('automation_steps')
    .select('id, step_type, position, config, parent_step_id, branch')
    .eq('automation_id', automationId)
    .order('position', { ascending: true });
  return ((data ?? []) as WorkflowStep[])
    .filter((s) => !s.parent_step_id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

async function buildContext(db: Db, accountId: string, params: RunParams): Promise<ExecutionContext> {
  const ctx: ExecutionContext = {
    account_id: accountId,
    contact_id: params.contactId ?? null,
    conversation_id: params.conversationId ?? null,
    trigger_type: params.triggerType,
    trigger_data: params.triggerData ?? {},
    contact: null,
    conversation: null,
    deal: null,
  };

  if (params.contactId) {
    const { data } = await db.from('contacts').select('*').eq('id', params.contactId).eq('account_id', accountId).maybeSingle();
    ctx.contact = (data as Record<string, unknown> | null) ?? null;
  }
  if (params.conversationId) {
    const { data } = await db.from('conversations').select('*').eq('id', params.conversationId).eq('account_id', accountId).maybeSingle();
    ctx.conversation = (data as Record<string, unknown> | null) ?? null;
  } else if (params.contactId) {
    const { data } = await db
      .from('conversations')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', params.contactId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    ctx.conversation = (data as Record<string, unknown> | null) ?? null;
  }
  if (params.dealId) {
    const { data } = await db.from('deals').select('*').eq('id', params.dealId).eq('account_id', accountId).maybeSingle();
    ctx.deal = (data as Record<string, unknown> | null) ?? null;
  }
  return ctx;
}

function truncated(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 1000);
}

/**
 * Run a workflow. Real execution when `simulate` is falsy.
 */
export async function runAutomation(params: RunParams): Promise<RunResult> {
  const { db, accountId, automation, simulate = false } = params;
  const steps = params.steps ?? (await loadSteps(db, automation.id));
  const startIndex = Math.max(0, params.startStepIndex ?? 0);
  const ctx = await buildContext(db, accountId, params);

  const stepsLog: StepLog[] = [];
  let executionId: string | null = params.executionId ?? null;
  let currentIndex = startIndex;

  // ── Execution record (skip entirely in simulation) ──────────
  if (!simulate) {
    if (!executionId) {
      const { data: execution } = await db
        .from('crm3_automation_executions')
        .insert({
          account_id: accountId,
          automation_id: automation.id,
          contact_id: params.contactId ?? null,
          conversation_id: ctx.conversation_id ?? (ctx.conversation?.id as string | undefined) ?? null,
          trigger_type: params.triggerType,
          trigger_data: { ...(params.triggerData ?? {}), automation_id: automation.id },
          status: 'running',
          current_step: startIndex,
          total_steps: steps.length,
          steps_log: [],
          ai_results: {},
        })
        .select('id')
        .single();
      executionId = (execution?.id as string | undefined) ?? null;

      // Count this run exactly once (resumes do not re-count).
      await db
        .from('automations')
        .update({ execution_count: (automation.execution_count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', automation.id)
        .eq('account_id', accountId);
    } else {
      const { data: prev } = await db.from('crm3_automation_executions').select('steps_log').eq('id', executionId).single();
      if (Array.isArray(prev?.steps_log)) stepsLog.push(...(prev!.steps_log as StepLog[]));
    }
  }

  do {
    const step = steps[currentIndex];
    if (!step) break;
    const stepStart = Date.now();

    // ── Condition gate ────────────────────────────────────────
    if (step.step_type === 'condition') {
      const cfg = step.config as unknown as ConditionConfig;
      const { passed, results } = evaluateConditions(cfg, ctx);
      const summary = results.map((r) => `${r.rule.field} ${r.passed ? '✓' : '✗'}`).join(', ') || 'no rules';
      stepsLog.push({
        step_type: 'condition',
        status: passed ? 'completed' : 'skipped',
        detail: passed ? `Conditions matched (${summary}).` : `Conditions not met (${summary}) — workflow stopped.`,
        duration_ms: Date.now() - stepStart,
        executed_at: new Date().toISOString(),
      });
      if (!passed) {
        for (let i = currentIndex + 1; i < steps.length; i++) {
          stepsLog.push({
            step_type: steps[i].step_type,
            status: 'skipped',
            detail: 'Skipped because a previous condition was not met.',
            duration_ms: 0,
            executed_at: new Date().toISOString(),
          });
        }
        if (!simulate && executionId) {
          await db.from('crm3_automation_executions').update({ steps_log: stepsLog, current_step: steps.length }).eq('id', executionId);
        }
        return finalize(db, accountId, automation, executionId, 'completed', stepsLog, null, simulate);
      }
      currentIndex++;
      if (!simulate && executionId) {
        await db.from('crm3_automation_executions').update({ steps_log: stepsLog, current_step: currentIndex }).eq('id', executionId);
      }
      continue;
    }

    // ── Wait step (durable scheduling) ────────────────────────
    if (step.step_type === 'wait') {
      const amount = Number(step.config?.amount ?? 1);
      const unit = String(step.config?.unit ?? 'hours');
      const factor = unit === 'minutes' ? 60_000 : unit === 'days' ? 86_400_000 : 3_600_000;
      const waitMs = (Number.isFinite(amount) && amount > 0 ? amount : 1) * factor;
      const runAt = new Date(Date.now() + waitMs).toISOString();

      stepsLog.push({
        step_type: 'wait',
        status: 'completed',
        detail: `Waiting ${amount} ${unit} (resume at ${runAt}).`,
        duration_ms: Date.now() - stepStart,
        executed_at: new Date().toISOString(),
      });

      if (simulate) {
        return { executionId: null, status: 'waiting', stepsLog, errorMessage: null, simulated: true };
      }

      if (executionId) {
        await db.from('crm3_automation_scheduled_jobs').insert({
          account_id: accountId,
          automation_id: automation.id,
          execution_id: executionId,
          contact_id: params.contactId ?? null,
          conversation_id: ctx.conversation?.id ?? null,
          job_type: 'resume',
          run_at: runAt,
          status: 'pending',
          next_step_index: currentIndex + 1,
          payload: { trigger_data: params.triggerData ?? {} },
        });
        await db
          .from('crm3_automation_executions')
          .update({ status: 'waiting', wait_until: runAt, current_step: currentIndex, steps_log: stepsLog })
          .eq('id', executionId);
      }
      return { executionId, status: 'waiting', stepsLog, errorMessage: null, simulated: false };
    }

    // ── Action step ───────────────────────────────────────────
    let result;
    if (simulate) {
      result = { status: 'completed' as const, detail: `[simulated] ${step.step_type} would run.` };
    } else {
      try {
        result = await executeAction(db, accountId, step, ctx);
      } catch (err) {
        result = { status: 'failed' as const, detail: truncated(err) };
      }
    }

    stepsLog.push({
      step_type: step.step_type,
      status: result.status,
      detail: result.detail,
      duration_ms: Date.now() - stepStart,
      executed_at: new Date().toISOString(),
    });

    currentIndex++;

    if (!simulate && executionId) {
      await db.from('crm3_automation_executions').update({ steps_log: stepsLog, current_step: currentIndex }).eq('id', executionId);
    }

    if (result.status === 'failed') {
      return finalize(db, accountId, automation, executionId, 'failed', stepsLog, result.detail, simulate);
    }
    if (result.end) {
      return finalize(db, accountId, automation, executionId, 'completed', stepsLog, null, simulate);
    }
  } while (currentIndex < steps.length);

  return finalize(db, accountId, automation, executionId, 'completed', stepsLog, null, simulate);
}

async function finalize(
  db: Db,
  accountId: string,
  automation: AutomationRecord,
  executionId: string | null,
  status: 'completed' | 'failed',
  stepsLog: StepLog[],
  errorMessage: string | null,
  simulate: boolean
): Promise<RunResult> {
  if (!simulate) {
    if (executionId) {
      await db
        .from('crm3_automation_executions')
        .update({
          status,
          steps_log: stepsLog,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);
    }

    const update: Record<string, unknown> = {
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (status === 'completed') {
      update.success_count = (automation.success_count ?? 0) + 1;
      update.last_error = null;
    } else {
      update.failure_count = (automation.failure_count ?? 0) + 1;
      update.last_error = errorMessage;
      update.last_error_at = new Date().toISOString();
    }
    await db.from('automations').update(update).eq('id', automation.id).eq('account_id', accountId);
  }

  return { executionId, status, stepsLog, errorMessage, simulated: simulate };
}
