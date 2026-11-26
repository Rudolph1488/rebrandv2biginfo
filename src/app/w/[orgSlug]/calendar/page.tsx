import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import CalendarClient from './CalendarClient';
import type { OrderRecord, OrderStatus } from '@/types/crm';

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.orders) {
    redirect(`/w/${org.slug}`);
  }

  const supabase = await createClient();

  const [statusesRes, scheduledRes, unscheduledRes] = await Promise.all([
    supabase
      .from('order_statuses')
      .select('*')
      .eq('org_id', org.id)
      .order('position', { ascending: true }),
    supabase
      .from('orders')
      .select(
        'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, ttn, delivery_city, delivery_warehouse, notes, deadline, created_at, client:clients(id, contact_person, phone)'
      )
      .eq('org_id', org.id)
      .not('deadline', 'is', null)
      .order('deadline', { ascending: true })
      .order('order_number', { ascending: false })
      .limit(500),
    supabase
      .from('orders')
      .select(
        'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, ttn, delivery_city, delivery_warehouse, notes, deadline, created_at, client:clients(id, contact_person, phone)'
      )
      .eq('org_id', org.id)
      .is('deadline', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  let migrationMissing = false;
  let unscheduledRows = unscheduledRes.data;

  // Fallback if 0005_order_deadline.sql hasn't been executed in Supabase yet
  if (scheduledRes.error || unscheduledRes.error) {
    migrationMissing = true;
    const fallbackRes = await supabase
      .from('orders')
      .select(
        'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, ttn, delivery_city, delivery_warehouse, notes, created_at, client:clients(id, contact_person, phone)'
      )
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(100);
    unscheduledRows = (fallbackRes.data || []).map((row) => ({
      ...row,
      deadline: null,
    }));
  }

  const normalize = (rows: unknown[] | null) =>
    (rows || []).map((row) => {
      const o = row as OrderRecord & { client?: unknown };
      return {
        ...o,
        client: Array.isArray(o.client) ? o.client[0] : o.client,
      } as OrderRecord;
    });

  return (
    <CalendarClient
      org={org}
      statuses={(statusesRes.data || []) as OrderStatus[]}
      initialScheduled={normalize(scheduledRes.data)}
      initialUnscheduled={normalize(unscheduledRows)}
      migrationMissing={migrationMissing}
    />
  );
}
