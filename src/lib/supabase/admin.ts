/**
 * CRM 3.0 — Service-role Supabase client (server only).
 *
 * Used by trusted background workers (the automation scheduler) that run
 * without a user session. Never import this from a client component.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
