import { notFound, redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import ClientDossierClient from './ClientDossierClient';
import type { ClientRecord, OrderRecord, OrderStatus } from '@/types/crm';

export default async function ClientDossierPage({
  params,
}: {
  params: Promise<{ orgSlug: string; clientId: string }>;
}) {
  const { orgSlug, clientId } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.clients) {
    redirect(`/w/${org.slug}`);
  }

  const canViewCost = isAdmin || permissions.view_cost_price;
  const supabase = await createClient();

  const [clientRes, ordersRes, statusesRes] = await Promise.all([
    supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('org_id', org.id)
      .single(),
    supabase
      .from('orders')
      .select(
        'id, org_id, order_number, status_id, source_name, total_amount, total_cost, ttn, delivery_city, delivery_warehouse, notes, created_at'
      )
      .eq('org_id', org.id)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_statuses')
      .select('*')
      .eq('org_id', org.id)
      .order('position', { ascending: true }),
  ]);

  if (!clientRes.data) {
    notFound();
  }

  return (
    <ClientDossierClient
      org={org}
      initialClient={clientRes.data as ClientRecord}
      orders={(ordersRes.data || []) as unknown as OrderRecord[]}
      statuses={(statusesRes.data || []) as OrderStatus[]}
      canViewCost={canViewCost}
      canDelete={isAdmin}
    />
  );
}
