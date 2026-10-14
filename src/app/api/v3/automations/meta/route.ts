/**
 * CRM 3.0 — Automation builder metadata.
 * GET /api/v3/automations/meta
 * Trigger / action / condition catalogue plus account agents for selects.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount } from '@/lib/automation/auth';
import { TRIGGERS, ACTIONS, CHANNELS, LEAD_STATUSES, TRIGGER_CATEGORY_LABELS } from '@/lib/automation/catalog';
import { CONDITION_FIELDS, OPERATORS } from '@/lib/automation/conditions';
import { TEMPLATE_VARIABLES } from '@/lib/automation/template';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId } = auth.session;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, role')
      .eq('account_id', accountId);

    const agents = (profiles ?? []).map((p) => ({
      value: p.user_id as string,
      label: (p.full_name as string) || (p.user_id as string).slice(0, 8),
      role: p.role as string,
    }));

    return NextResponse.json({
      triggers: TRIGGERS,
      actions: ACTIONS,
      condition_fields: CONDITION_FIELDS,
      operators: OPERATORS,
      channels: CHANNELS,
      lead_statuses: LEAD_STATUSES,
      variables: TEMPLATE_VARIABLES,
      trigger_categories: TRIGGER_CATEGORY_LABELS,
      agents,
    });
  } catch (err) {
    console.error('[automations meta]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
