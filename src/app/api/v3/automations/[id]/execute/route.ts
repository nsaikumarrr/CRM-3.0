/**
 * CRM 3.0 — Manual automation execution.
 * POST /api/v3/automations/[id]/execute
 *
 * Runs a workflow for a specific contact. Use `dryRun: true` for a
 * side-effect-free simulation. Real runs execute the action handlers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount, verifyAutomationOwnership, canManage } from '@/lib/automation/auth';
import { runAutomation } from '@/lib/automation/engine';
import type { AutomationRecord } from '@/lib/automation/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const body = (await req.json()) as { contactId?: string; dryRun?: boolean; triggerData?: Record<string, unknown> };
    if (!body.contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 });

    const { data: automation } = await supabase.from('automations').select('*').eq('id', id).eq('account_id', accountId).single();
    if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: contact } = await supabase.from('contacts').select('id').eq('id', body.contactId).eq('account_id', accountId).maybeSingle();
    if (!contact) return NextResponse.json({ error: 'Contact not found in this account' }, { status: 404 });

    const result = await runAutomation({
      db: supabase,
      accountId,
      automation: automation as AutomationRecord,
      triggerType: 'manual',
      triggerData: { ...(body.triggerData ?? {}), manual: true },
      contactId: body.contactId,
      simulate: Boolean(body.dryRun),
    });

    return NextResponse.json({
      execution_id: result.executionId,
      status: result.status,
      simulated: result.simulated,
      steps_log: result.stepsLog,
      error_message: result.errorMessage,
    });
  } catch (err) {
    console.error('[automations execute]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
