/**
 * CRM 3.0 — Automation execution history.
 * GET /api/v3/automations/[id]/executions
 * Filters: status, from, to, page, pageSize.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount, verifyAutomationOwnership } from '@/lib/automation/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId } = auth.session;

    if (!(await verifyAutomationOwnership(supabase, id, accountId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
    const pageSize = Math.min(Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25')), 100);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('crm3_automation_executions')
      .select('id,status,trigger_type,contact_id,conversation_id,started_at,completed_at,current_step,total_steps,error_message', { count: 'exact' })
      .eq('automation_id', id)
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (status && status !== 'all') query = query.eq('status', status);
    if (from) query = query.gte('started_at', from);
    if (to) query = query.lte('started_at', to);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ executions: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error('[automations executions]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
