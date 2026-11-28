import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import SettingsClient from './SettingsClient';
import type { AuditLogRecord, OrderStatus } from '@/types/crm';

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

  const [membersRes, pushSubsRes, invitesRes, channelsRes, statusesRes, auditRes] =
    await Promise.all([
      supabase
        .from('organization_members')
        .select(
          'id, user_id, role, permissions, push_permission, push_updated_at, profile:profiles(email, full_name)'
        )
        .eq('org_id', org.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('push_subscriptions')
        .select('user_id')
        .eq('org_id', org.id)
        .eq('is_active', true),
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
      isAdmin
        ? supabase
            .from('audit_logs')
            .select('id, org_id, user_id, user_email, action, entity_type, entity_id, metadata, created_at')
            .eq('org_id', org.id)
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
    ]);

  let membersData = membersRes.data;
  if (membersRes.error) {
    // Graceful fallback if 0008_push_notifications.sql hasn't been executed yet
    const fallback = await supabase
      .from('organization_members')
      .select('id, user_id, role, permissions, profile:profiles(email, full_name)')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true });
    membersData = (fallback.data || []).map((m) => ({
      ...m,
      push_permission: 'default',
      push_updated_at: null,
    }));
  }

  const deviceCounts: Record<string, number> = {};
  for (const sub of pushSubsRes.data || []) {
    deviceCounts[sub.user_id] = (deviceCounts[sub.user_id] || 0) + 1;
  }

  const normalizedMembers = (membersData || []).map((m) => ({
    ...m,
    push_devices: deviceCounts[m.user_id] || 0,
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
      initialAuditLogs={
        (auditRes.data || []) as unknown as AuditLogRecord[]
      }
      auditMigrationMissing={Boolean(auditRes.error)}
    />
  );
}
