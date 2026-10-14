/**
 * CRM 3.0 — Duplicate automation.
 * POST /api/v3/automations/[id]/duplicate
 * Creates a draft copy including all workflow steps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount, verifyAutomationOwnership, canManage } from '@/lib/automation/auth';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId, userId, role } = auth.session;

    if (!canManage(role)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    if (!(await verifyAutomationOwnership(supabase, id, accountId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: source } = await supabase.from('automations').select('*').eq('id', id).eq('account_id', accountId).single();
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: copy, error } = await supabase
      .from('automations')
      .insert({
        account_id: accountId,
        created_by: userId,
        name: `${source.name} (copy)`,
        description: source.description,
        trigger_type: source.trigger_type,
        trigger_config: source.trigger_config ?? {},
        ai_enabled: source.ai_enabled ?? false,
        is_active: false,
        status: 'draft',
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
      })
      .select('*')
      .single();

    if (error || !copy) return NextResponse.json({ error: error?.message ?? 'Failed to duplicate' }, { status: 500 });

    const { data: steps } = await supabase
      .from('automation_steps')
      .select('step_type,position,config,parent_step_id,branch')
      .eq('automation_id', id)
      .order('position', { ascending: true });

    if (steps && steps.length > 0) {
      const rows = steps.map((s) => ({
        automation_id: copy.id,
        step_type: s.step_type,
        position: s.position,
        config: s.config,
        parent_step_id: null,
        branch: s.branch,
      }));
      await supabase.from('automation_steps').insert(rows);
    }

    return NextResponse.json({ automation: copy }, { status: 201 });
  } catch (err) {
    console.error('[automations duplicate]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
