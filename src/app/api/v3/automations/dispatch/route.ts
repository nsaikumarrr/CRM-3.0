/**
 * CRM 3.0 — Automation event ingestion.
 * POST /api/v3/automations/dispatch
 *
 * Accepts a normalised CRM event and runs every matching active automation.
 * Can be called from inside the app (user session) or by a trusted
 * server-to-server integration using the CRON_SECRET bearer token.
 *
 * Idempotent: repeat deliveries with the same event_key are ignored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount } from '@/lib/automation/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchEvent, makeEventKey } from '@/lib/automation/dispatcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      event_type?: string;
      event_key?: string;
      contact_id?: string | null;
      conversation_id?: string | null;
      deal_id?: string | null;
      version?: string | number;
      payload?: Record<string, unknown>;
      account_id?: string;
    };

    if (!body.event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 });
    }

    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    const isServerCall = token === CRON_SECRET && Boolean(body.account_id);

    let accountId: string;
    let db;

    if (isServerCall) {
      const admin = createAdminClient();
      if (!admin) return NextResponse.json({ error: 'Server credentials not configured' }, { status: 500 });
      const { data: account } = await admin.from('accounts').select('id').eq('id', body.account_id).maybeSingle();
      if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      accountId = body.account_id as string;
      db = admin;
    } else {
      const supabase = await createClient();
      const auth = await requireAccount(supabase);
      if ('response' in auth) return auth.response;
      accountId = auth.session.accountId;
      db = supabase;
    }

    const objectId = (body.contact_id || body.conversation_id || body.deal_id || body.event_type) as string;
    const eventKey = body.event_key ?? makeEventKey(body.event_type, objectId, body.version);

    const result = await dispatchEvent(db, accountId, {
      event_type: body.event_type,
      event_key: eventKey,
      contact_id: body.contact_id ?? null,
      conversation_id: body.conversation_id ?? null,
      deal_id: body.deal_id ?? null,
      payload: body.payload ?? {},
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[automations dispatch]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
