import { createClient } from '@/lib/supabase/server';
import { AutomationsView } from '@/components/automation/AutomationsView';

export const dynamic = 'force-dynamic';

const MANAGE_ROLES = new Set(['owner', 'admin', 'agent']);

export default async function AutomationsPage() {
  let canManage = true;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile?.role) canManage = MANAGE_ROLES.has(profile.role as string);
    } else {
      canManage = false;
    }
  } catch {
    // If the session cannot be resolved, let the API enforce permissions.
    canManage = true;
  }

  return <AutomationsView canManage={canManage} />;
}
