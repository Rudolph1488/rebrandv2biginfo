import { requireSuperAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import SuperAdminClient from './SuperAdminClient';

export default async function SuperAdminPage() {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: orgs } = await admin
    .from('organizations')
    .select('*, organization_members(count)')
    .order('created_at', { ascending: false });

  const { data: pendingInvites } = await admin
    .from('organization_invites')
    .select('id, email, role, token, org_id, expires_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  return (
    <SuperAdminClient
      userEmail={ctx.user.email || ''}
      initialOrgs={orgs || []}
      initialInvites={pendingInvites || []}
    />
  );
}
