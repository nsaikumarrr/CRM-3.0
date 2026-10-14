/**
 * CRM 3.0 — Automation detail API
 * GET    /api/v3/automations/[id]  — automation + steps + recent executions
 * PATCH  /api/v3/automations/[id]  — update, replace steps, activate/pause
 * DELETE /api/v3/automations/[id]  — delete (cascades steps/executions)
 *
 * Security: account_id is resolved from the session; ownership verified.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount, verifyAutomationOwnership, canManage } from '@/lib/automation/auth';
import { validateWorkflow } from '@/lib/automation/validation';
import type { WorkflowStep } from '@/lib/automation/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId } = auth.session;

    const { data: automation, error } = await supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error || !automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [{ data: steps }, { data: executions }] = await Promise.all([
      supabase.from('automation_steps').select('*').eq('automation_id', id).order('position', { ascending: true }),
      supabase
        .from('crm3_automation_executions')
        .select('id,status,trigger_type,contact_id,conversation_id,started_at,completed_at,current_step,total_steps,error_message,steps_log')
        .eq('automation_id', id)
        .eq('account_id', accountId)
        .order('started_at', { ascending: false })
        .limit(25),
    ]);

    return NextResponse.json({ automation, steps: steps ?? [], executions: executions ?? [] });
  } catch (err) {
    console.error('[automations GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId, role } = auth.session;

    if (!canManage(role)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    if (!(await verifyAutomationOwnership(supabase, id, accountId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = (await req.json()) as {
      name?: string;
      description?: string | null;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
      ai_enabled?: boolean;
      status?: string;
      activate?: boolean;
      steps?: WorkflowStep[];
    };

    const { data: current } = await supabase.from('automations').select('*').eq('id', id).eq('account_id', accountId).single();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Resolve the effective workflow for validation.
    const effectiveSteps = body.steps
      ? body.steps.map((s, i) => ({ ...s, position: s.position ?? i }))
      : await supabase.from('automation_steps').select('id,step_type,position,config,parent_step_id,branch').eq('automation_id', id).order('position', { ascending: true }).then((r) => (r.data ?? []) as WorkflowStep[]);

    const effectiveTrigger = body.trigger_type ?? current.trigger_type;
    const effectiveConfig = (body.trigger_config ?? current.trigger_config ?? {}) as Record<string, unknown>;
    const effectiveName = body.name ?? current.name;
    const wantsActive = body.activate === true || body.status === 'active';

    if (wantsActive) {
      const validation = validateWorkflow({ name: effectiveName, trigger_type: effectiveTrigger, trigger_config: effectiveConfig, steps: effectiveSteps });
      if (!validation.valid) {
        return NextResponse.json({ error: 'Cannot activate an invalid automation', issues: validation.errors }, { status: 400 });
      }
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('name' in body && body.name !== undefined) update.name = String(body.name).trim();
    if ('description' in body) update.description = body.description ? String(body.description).trim() : null;
    if ('trigger_type' in body && body.trigger_type) update.trigger_type = body.trigger_type;
    if ('trigger_config' in body) update.trigger_config = body.trigger_config ?? {};
    if ('ai_enabled' in body) update.ai_enabled = Boolean(body.ai_enabled);
    if (body.steps) update.workflow_version = (current.workflow_version ?? 1) + 1;

    if (body.activate === true || body.status === 'active') {
      update.is_active = true;
      update.status = 'active';
      if ((body.trigger_type ?? current.trigger_type) === 'time_based' && !current.next_run_at) {
        update.next_run_at = new Date().toISOString();
      }
    } else if (body.activate === false) {
      update.is_active = false;
      update.status = 'paused';
    } else if (body.status && ['draft', 'paused', 'archived', 'error'].includes(body.status)) {
      update.status = body.status;
      update.is_active = false;
    }

    const { data: automation, error } = await supabase
      .from('automations')
      .update(update)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Replace steps when provided.
    if (body.steps) {
      await supabase.from('automation_steps').delete().eq('automation_id', id);
      if (body.steps.length > 0) {
        const rows = body.steps.map((s, i) => ({
          automation_id: id,
          step_type: s.step_type,
          position: s.position ?? i,
          config: s.config ?? {},
          parent_step_id: s.parent_step_id ?? null,
          branch: s.branch ?? null,
        }));
        const { error: stepsErr } = await supabase.from('automation_steps').insert(rows);
        if (stepsErr) return NextResponse.json({ error: `Failed to save steps: ${stepsErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ automation });
  } catch (err) {
    console.error('[automations PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId, role } = auth.session;

    if (!canManage(role)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    if (!(await verifyAutomationOwnership(supabase, id, accountId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cancel any pending scheduled jobs before deleting.
    await supabase.from('crm3_automation_scheduled_jobs').update({ status: 'cancelled', lock_until: null }).eq('automation_id', id).eq('status', 'pending');

    const { error } = await supabase.from('automations').delete().eq('id', id).eq('account_id', accountId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[automations DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
