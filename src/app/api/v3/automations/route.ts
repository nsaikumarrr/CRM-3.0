/**
 * CRM 3.0 — Automations collection API
 * GET  /api/v3/automations  — list + filter + paginate
 * POST /api/v3/automations  — create (validated) automation
 *
 * Security: account_id is always resolved from the session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount, canManage } from '@/lib/automation/auth';
import { validateWorkflow } from '@/lib/automation/validation';
import type { WorkflowStep } from '@/lib/automation/types';

export const dynamic = 'force-dynamic';

const ALLOWED_SORTS = new Set(['created_at', 'updated_at', 'name', 'execution_count', 'last_run_at']);

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId } = auth.session;

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const trigger = url.searchParams.get('trigger');
    const search = url.searchParams.get('search');
    const sort = url.searchParams.get('sort') ?? 'updated_at';
    const order = url.searchParams.get('order') === 'asc' ? true : false;
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
    const pageSize = Math.min(Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20')), 100);
    const from = (page - 1) * pageSize;

    let query = supabase
      .from('automations')
      .select(
        'id,name,description,trigger_type,trigger_config,is_active,status,ai_enabled,execution_count,success_count,failure_count,last_run_at,last_error,created_by,created_at,updated_at',
        { count: 'exact' }
      )
      .eq('account_id', accountId)
      .order(ALLOWED_SORTS.has(sort) ? sort : 'updated_at', { ascending: order })
      .range(from, from + pageSize - 1);

    if (status && status !== 'all') query = query.eq('status', status);
    if (trigger && trigger !== 'all') query = query.eq('trigger_type', trigger);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      automations: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[automations GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId, userId, role } = auth.session;

    if (!canManage(role)) {
      return NextResponse.json({ error: 'You do not have permission to create automations' }, { status: 403 });
    }

    const body = (await req.json()) as {
      name?: string;
      description?: string | null;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
      steps?: WorkflowStep[];
      ai_enabled?: boolean;
      activate?: boolean;
    };

    const steps = (body.steps ?? []).map((s, i) => ({ ...s, position: s.position ?? i }));
    const validation = validateWorkflow({
      name: body.name,
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config,
      steps,
    });

    if (!validation.valid && body.activate) {
      return NextResponse.json({ error: 'Cannot activate an invalid automation', issues: validation.errors }, { status: 400 });
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!body.trigger_type) {
      return NextResponse.json({ error: 'trigger_type is required' }, { status: 400 });
    }

    const activate = Boolean(body.activate) && validation.valid;
    const now = new Date().toISOString();

    const { data: automation, error: autoErr } = await supabase
      .from('automations')
      .insert({
        account_id: accountId,
        created_by: userId,
        name: body.name.trim(),
        description: body.description?.toString().trim() || null,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config ?? {},
        is_active: activate,
        status: activate ? 'active' : 'draft',
        ai_enabled: body.ai_enabled ?? false,
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
        updated_at: now,
        next_run_at: activate && body.trigger_type === 'time_based' ? now : null,
      })
      .select('*')
      .single();

    if (autoErr || !automation) {
      return NextResponse.json({ error: autoErr?.message ?? 'Failed to create automation' }, { status: 500 });
    }

    if (steps.length > 0) {
      const rows = steps.map((s, i) => ({
        automation_id: automation.id,
        step_type: s.step_type,
        position: s.position ?? i,
        config: s.config ?? {},
        parent_step_id: s.parent_step_id ?? null,
        branch: s.branch ?? null,
      }));
      const { error: stepsErr } = await supabase.from('automation_steps').insert(rows);
      if (stepsErr) {
        console.error('[automations POST] steps insert failed:', stepsErr);
        await supabase.from('automations').delete().eq('id', automation.id);
        return NextResponse.json({ error: `Failed to save workflow steps: ${stepsErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ automation, warnings: validation.warnings }, { status: 201 });
  } catch (err) {
    console.error('[automations POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
