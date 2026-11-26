import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import ProductionClient, { type ProductionOrderRow } from './ProductionClient';
import type { OrderStatus } from '@/types/crm';

export default async function ProductionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { user, membership, org, isAdmin, permissions } =
    await requireOrgAccess(orgSlug);

  const canAccessProduction =
    isAdmin ||
    Boolean(permissions.production) ||
    membership.role === 'producer';

  if (!canAccessProduction) {
    redirect(`/w/${org.slug}`);
  }

  const supabase = await createClient();

  const [statusesRes, membersRes] = await Promise.all([
    supabase
      .from('order_statuses')
      .select('id, name, color, position, is_final')
      .eq('org_id', org.id)
      .order('position', { ascending: true }),
    supabase
      .from('organization_members')
      .select('user_id, profile:profiles(id, full_name, email)')
      .eq('org_id', org.id),
  ]);

  const statuses = (statusesRes.data || []) as OrderStatus[];
  // Show orders in Production once they move past the first stage ("Нове") and are not final ("Отримано")
  const productionStageIds = statuses
    .filter((s, idx) => idx > 0 && !s.is_final)
    .map((s) => s.id);

  const ordersRes =
    productionStageIds.length > 0
      ? await supabase
          .from('orders')
          .select(
            'id, order_number, status_id, deadline, notes, ttn, delivery_city, production_status, production_accepted_by, production_accepted_at, production_completed_at, production_elapsed_seconds, production_timer_started_at, created_at, order_items(id, name, qty, attributes)'
          )
          .eq('org_id', org.id)
          .in('status_id', productionStageIds)
          .order('deadline', { ascending: true, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .limit(300)
      : { data: [], error: null };

  const profileMap: Record<string, string> = {};
  for (const m of membersRes.data || []) {
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    if (p && m.user_id) {
      profileMap[m.user_id] = p.full_name || p.email || 'Співробітник';
    }
  }

  const migrationMissing = Boolean(ordersRes.error);

  return (
    <ProductionClient
      org={org}
      currentUserId={user.id}
      canOpenOrders={isAdmin || Boolean(permissions.orders)}
      statuses={statuses}
      initialOrders={(ordersRes.data || []) as ProductionOrderRow[]}
      profileMap={profileMap}
      migrationMissing={migrationMissing}
    />
  );
}
