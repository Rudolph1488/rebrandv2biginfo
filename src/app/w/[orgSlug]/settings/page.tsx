import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import SettingsClient from './SettingsClient';
import type { OrderStatus } from '@/types/crm';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.settings) {
    redirect(`/w/${org.slug}`);
  }

  const supabase = await createClient();

  const [membersRes, invitesRes, channelsRes, statusesRes] = await Promise.all([
    supabase
      .from('organization_members')
      .select('id, user_id, role, permissions, profile:profiles(email, full_name)')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('organization_invites')
      .select('id, email, role, token, accepted_at, expires_at')
      .eq('org_id', org.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
    isAdmin
      ? supabase
          .from('integration_channels')
          .select('id, type, name, is_active, webhook_secret, created_at')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from('order_statuses')
      .select('*')
      .eq('org_id', org.id)
      .order('position', { ascending: true }),
  ]);

  const normalizedMembers = (membersRes.data || []).map((m) => ({
    ...m,
    profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
  }));

  return (
    <SettingsClient
      org={org}
      isAdmin={isAdmin}
      initialMembers={normalizedMembers as never}
      initialInvites={invitesRes.data || []}
      initialChannels={channelsRes.data || []}
      initialStatuses={(statusesRes.data || []) as OrderStatus[]}
    />
  );
}
