/**
 * CRM 3.0 — Automation test / dry-run.
 * POST /api/v3/automations/[id]/test
 *
 * Validates a workflow (saved or unsaved draft) and, when given a contact,
 * produces a side-effect-free simulation using the real condition engine.
 * This never sends real messages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount, verifyAutomationOwnership } from '@/lib/automation/auth';
import { validateWorkflow } from '@/lib/automation/validation';
import { runAutomation } from '@/lib/automation/engine';
import type { AutomationRecord, WorkflowStep } from '@/lib/automation/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;
    const { accountId } = auth.session;

    if (!(await verifyAutomationOwnership(supabase, id, accountId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      mode?: 'validate' | 'simulate';
      contactId?: string;
      draft?: {
        name?: string;
        trigger_type?: string;
        trigger_config?: Record<string, unknown>;
        steps?: WorkflowStep[];
      };
    };

    const { data: automation } = await supabase.from('automations').select('*').eq('id', id).eq('account_id', accountId).single();
    if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const draft = body.draft;
    const steps: WorkflowStep[] = draft?.steps
      ? draft.steps.map((s, i) => ({ ...s, position: s.position ?? i }))
      : ((await supabase.from('automation_steps').select('id,step_type,position,config').eq('automation_id', id).order('position', { ascending: true })).data ?? []) as WorkflowStep[];

    const triggerType = draft?.trigger_type ?? automation.trigger_type;
    const triggerConfig = (draft?.trigger_config ?? automation.trigger_config ?? {}) as Record<string, unknown>;
    const name = draft?.name ?? automation.name;

    const validation = validateWorkflow({ name, trigger_type: triggerType, trigger_config: triggerConfig, steps });

    if (body.mode === 'simulate') {
      if (!body.contactId) {
        return NextResponse.json({ validation, error: 'contactId is required for a simulation' }, { status: 400 });
      }
      const { data: contact } = await supabase.from('contacts').select('id').eq('id', body.contactId).eq('account_id', accountId).maybeSingle();
      if (!contact) return NextResponse.json({ validation, error: 'Contact not found in this account' }, { status: 404 });

      const simulation = await runAutomation({
        db: supabase,
        accountId,
        automation: automation as AutomationRecord,
        triggerType,
        triggerData: { simulated: true, account_id: accountId },
        contactId: body.contactId,
        simulate: true,
        steps,
      });

      return NextResponse.json({
        validation,
        simulation: {
          mode: 'simulation',
          status: simulation.status,
          steps_log: simulation.stepsLog,
          note: 'Simulation only — no messages were sent and no records were changed.',
        },
      });
    }

    return NextResponse.json({ validation, mode: 'validate' });
  } catch (err) {
    console.error('[automations test]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
