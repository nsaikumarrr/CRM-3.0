/**
 * CRM 3.0 — Single execution detail.
 * GET /api/v3/automations/[id]/executions/[executionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount } from '@/lib/automation/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; executionId: string }> }) {
  try {
    const { id, executionId } = await params;
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId } = auth.session;

    const { data, error } = await supabase
      .from('crm3_automation_executions')
      .select('*')
      .eq('id', executionId)
      .eq('automation_id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ execution: data });
  } catch (err) {
    console.error('[automations execution detail]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
