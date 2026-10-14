/**
 * CRM 3.0 — Automation templates API
 * GET /api/v3/automations/templates
 *
 * Returns DB-stored templates (if the migration seeded them) merged with
 * the built-in catalogue defined in code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccount } from '@/lib/automation/auth';
import { BUILTIN_TEMPLATES } from '@/lib/automation/templates';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAccount(supabase);
    if ('response' in auth) return auth.response;

    const { data } = await supabase
      .from('crm3_automation_templates')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false });

    const dbTemplates = (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      trigger_type: t.trigger_type,
      trigger_config: t.trigger_config ?? {},
      steps: Array.isArray(t.steps) ? t.steps : [],
      ai_nodes: Array.isArray(t.ai_nodes) ? t.ai_nodes : [],
      tags: Array.isArray(t.tags) ? t.tags : [],
      is_builtin: Boolean(t.is_builtin),
    }));

    const seen = new Set(dbTemplates.map((t) => t.name.toLowerCase()));
    const merged = [...dbTemplates, ...BUILTIN_TEMPLATES.filter((t) => !seen.has(t.name.toLowerCase()))];

    return NextResponse.json({ templates: merged });
  } catch (err) {
    console.error('[automation templates GET]', err);
    return NextResponse.json({ templates: BUILTIN_TEMPLATES });
  }
}
