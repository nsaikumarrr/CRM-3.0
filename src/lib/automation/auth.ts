/**
 * CRM 3.0 — Automation server helpers.
 * Session + account resolution shared by every automation API route.
 * Account id is always derived server-side — never trusted from the body.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export interface AccountSession {
  userId: string;
  accountId: string;
  role: string;
}

export async function requireAccount(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ session: AccountSession } | { response: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile?.account_id) {
    return { response: NextResponse.json({ error: 'Account not found' }, { status: 403 }) };
  }

  return { session: { userId: user.id, accountId: profile.account_id as string, role: (profile.role as string) ?? 'agent' } };
}

export async function verifyAutomationOwnership(
  supabase: SupabaseClient,
  automationId: string,
  accountId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('automations')
    .select('id')
    .eq('id', automationId)
    .eq('account_id', accountId)
    .maybeSingle();
  return Boolean(data);
}

/** Roles allowed to mutate automations. Viewers are read-only. */
export function canManage(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'agent';
}
