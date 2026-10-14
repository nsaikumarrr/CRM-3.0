/**
 * CRM 3.0 — Automations dashboard statistics.
 * GET /api/v3/automations/stats
 * All values are computed from real rows — no hardcoded numbers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount } from '@/lib/automation/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId } = auth.session;

    const { data: automations, error } = await supabase
      .from('automations')
      .select('status,is_active')
      .eq('account_id', accountId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = automations ?? [];
    const stats = {
      total: rows.length,
      active: rows.filter((a) => a.status === 'active' || a.is_active).length,
      draft: rows.filter((a) => a.status === 'draft').length,
      paused: rows.filter((a) => a.status === 'paused').length,
      archived: rows.filter((a) => a.status === 'archived').length,
      error: rows.filter((a) => a.status === 'error').length,
    };

    const countByStatus = async (status: string) => {
      const { count } = await supabase
        .from('crm3_automation_executions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('status', status);
      return count ?? 0;
    };

    const [completed, failed, running, waiting] = await Promise.all([
      countByStatus('completed'),
      countByStatus('failed'),
      countByStatus('running'),
      countByStatus('waiting'),
    ]);

    const totalExecutions = completed + failed + running + waiting;
    const successRate = completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : 0;

    return NextResponse.json({
      ...stats,
      executions: {
        total: totalExecutions,
        completed,
        failed,
        running,
        waiting,
        successRate,
      },
    });
  } catch (err) {
    console.error('[automations stats]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
