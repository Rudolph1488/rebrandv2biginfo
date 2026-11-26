import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Organization, OrgPermissions, OrgRole, Profile } from '@/types/crm';

export interface MembershipWithOrg {
  id: string;
  org_id: string;
  role: OrgRole;
  permissions: OrgPermissions;
  organization: Organization;
}

export const getUserContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profileRes, membershipsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_members')
      .select('id, org_id, role, permissions, organization:organizations(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ]);

  if (profileRes.error) {
    console.error('getUserContext profile error:', profileRes.error);
  }

  const normalizedMemberships = (membershipsRes.data ?? []).map((m) => ({
    id: m.id as string,
    org_id: m.org_id as string,
    role: m.role as OrgRole,
    permissions: m.permissions as OrgPermissions,
    organization: (Array.isArray(m.organization)
      ? m.organization[0]
      : m.organization) as Organization,
  }));

  return {
    user,
    profile: profileRes.data as Profile | null,
    memberships: normalizedMemberships,
  };
});

export async function requireUser() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  return ctx;
}

export async function requireSuperAdmin() {
  const ctx = await requireUser();
  if (!ctx.profile?.is_super_admin) {
    redirect('/');
  }
  return ctx;
}

export const requireOrgAccess = cache(async (orgSlug: string) => {
  const ctx = await requireUser();
  const membership = ctx.memberships.find(
    (m) => m.organization?.slug === orgSlug
  );

  if (!membership) {
    redirect('/');
  }

  const isAdmin =
    membership.role === 'owner' ||
    membership.role === 'admin' ||
    Boolean(ctx.profile?.is_super_admin);

  return {
    ...ctx,
    membership,
    org: membership.organization,
    isAdmin,
    permissions: membership.permissions,
  };
});
