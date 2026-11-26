import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import CalendarClient, { type CalendarOrder } from './CalendarClient';
import type { OrderStatus } from '@/types/crm';

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { membership, org, isAdmin, permissions } =
    await requireOrgAccess(orgSlug);

  const canManageOrders = isAdmin || Boolean(permissions.orders);
  const canAccessCalendar =
    canManageOrders ||
    Boolean(permissions.calendar) ||
    membership.role === 'producer';

  if (!canAccessCalendar) {
    redirect(`/w/${org.slug}`);
  }

  const supabase = await createClient();

  const { data: statusesData } = await supabase
    .from('order_statuses')
    .select('*')
    .eq('org_id', org.id)
    .order('position', { ascending: true });

  const statuses = (statusesData || []) as OrderStatus[];
  const activeStatusIds = statuses.filter((s) => !s.is_final).map((s) => s.id);

  const scheduledSelect = canManageOrders
    ? 'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, ttn, delivery_city, delivery_warehouse, notes, deadline, production_status, created_at, client:clients(id, contact_person, phone), order_items(id, name, qty, attributes)'
    : 'id, org_id, order_number, status_id, notes, deadline, production_status, created_at, order_items(id, name, qty, attributes)';

  const unscheduledQuery =
    canManageOrders && activeStatusIds.length > 0
      ? supabase
          .from('orders')
          .select(
            'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, ttn, delivery_city, delivery_warehouse, notes, deadline, production_status, created_at, client:clients(id, contact_person, phone)'
          )
          .eq('org_id', org.id)
          .in('status_id', activeStatusIds)
          .is('deadline', null)
          .order('updated_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null });

  const [scheduledRes, unscheduledRes] = await Promise.all([
    supabase
      .from('orders')
      .select(scheduledSelect)
      .eq('org_id', org.id)
      .not('deadline', 'is', null)
      .order('deadline', { ascending: true })
      .order('order_number', { ascending: false })
      .limit(500),
    unscheduledQuery,
  ]);

  let migrationMissing = false;
  let unscheduledRows: unknown[] | null = unscheduledRes.data;

  if (scheduledRes.error || unscheduledRes.error) {
    migrationMissing = true;
    if (canManageOrders && activeStatusIds.length > 0) {
      const fallbackRes = await supabase
        .from('orders')
        .select(
          'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, ttn, delivery_city, delivery_warehouse, notes, created_at, client:clients(id, contact_person, phone)'
        )
        .eq('org_id', org.id)
        .in('status_id', activeStatusIds)
        .order('updated_at', { ascending: false })
        .limit(100);
      unscheduledRows = (fallbackRes.data || []).map((row) => ({
        ...row,
        deadline: null,
      }));
    }
  }

  const normalize = (rows: unknown[] | null): CalendarOrder[] =>
    (rows || []).map((row) => {
      const o = row as CalendarOrder & { client?: unknown };
      return {
        ...o,
        total_amount: canManageOrders ? o.total_amount : 0,
        client: canManageOrders
          ? Array.isArray(o.client)
            ? o.client[0]
            : o.client
          : null,
      } as CalendarOrder;
    });

  return (
    <CalendarClient
      org={org}
      statuses={statuses}
      initialScheduled={normalize(scheduledRes.data)}
      initialUnscheduled={normalize(unscheduledRows)}
      canManageOrders={canManageOrders}
      migrationMissing={migrationMissing}
    />
  );
}
