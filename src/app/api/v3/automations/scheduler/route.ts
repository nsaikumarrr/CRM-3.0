/**
 * CRM 3.0 — Automation background worker.
 * POST /api/v3/automations/scheduler
 *
 * Called by the cron job (see vercel.json). Resumes delayed executions and
 * fires scheduled triggers. Requires the CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAutomationScheduler } from '@/lib/automation/scheduler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createAdminClient() ?? (await createClient());
    const summary = await runAutomationScheduler(db);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[automations scheduler]', err);
    return NextResponse.json({ error: 'Scheduler failed' }, { status: 500 });
  }
}

/** Allow Vercel Cron (GET) to trigger the same worker. */
export async function GET(req: NextRequest) {
  return POST(req);
}
