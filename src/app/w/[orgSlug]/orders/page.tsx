import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import OrdersClient from './OrdersClient';
import type {
  ClientRecord,
  OrderRecord,
  OrderStatus,
  ProductRecord,
} from '@/types/crm';

const PAGE_SIZE = 50;

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    new?: string;
    clientId?: string;
    page?: string;
    q?: string;
    view?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const {
    new: openNew,
    clientId: prefillClientId,
    page = '1',
    q = '',
    view = 'kanban',
  } = await searchParams;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.orders) {
    redirect(`/w/${org.slug}`);
  }

  const canViewCost = isAdmin || permissions.view_cost_price;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const cleanQ = q.trim();

  const supabase = await createClient();

  let ordersQuery = supabase
    .from('orders')
    .select(
      'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, total_cost, ttn, delivery_city, delivery_warehouse, notes, deadline, created_at, client:clients(id, contact_person, phone)',
      { count: 'exact' }
    )
    .eq('org_id', org.id);

  if (cleanQ) {
    const numQ = Number(cleanQ.replace('#', ''));
    if (!Number.isNaN(numQ) && Number.isInteger(numQ) && numQ > 0) {
      ordersQuery = ordersQuery.or(
        `order_number.eq.${numQ},ttn.ilike.%${cleanQ}%,delivery_city.ilike.%${cleanQ}%`
      );
    } else {
      ordersQuery = ordersQuery.or(
        `ttn.ilike.%${cleanQ}%,delivery_city.ilike.%${cleanQ}%,source_name.ilike.%${cleanQ}%`
      );
    }
  }

  const [statusesRes, ordersRes, clientsRes, productsRes, warehousesRes] =
    await Promise.all([
      supabase
        .from('order_statuses')
        .select('*')
        .eq('org_id', org.id)
        .order('position', { ascending: true }),
      ordersQuery.order('created_at', { ascending: false }).range(from, to),
      supabase
        .from('clients')
        .select('id, contact_person, phone, np_city_name, np_warehouse_name')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('products')
        .select(
          canViewCost
            ? 'id, name, sale_price, cost_price, unit'
            : 'id, name, sale_price, unit'
        )
        .eq('org_id', org.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(200),
      supabase
        .from('warehouses')
        .select('id, name, is_default')
        .eq('org_id', org.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false }),
    ]);

  const normalizedOrders = (ordersRes.data || []).map((o) => ({
    ...o,
    total_cost: canViewCost ? o.total_cost : undefined,
    client: Array.isArray(o.client) ? o.client[0] : o.client,
  })) as unknown as OrderRecord[];

  let clientsList = (clientsRes.data || []) as unknown as ClientRecord[];
  if (prefillClientId && !clientsList.some((c) => c.id === prefillClientId)) {
    const { data: prefilled } = await supabase
      .from('clients')
      .select('id, contact_person, phone, np_city_name, np_warehouse_name')
      .eq('id', prefillClientId)
      .maybeSingle();
    if (prefilled) {
      clientsList = [prefilled as unknown as ClientRecord, ...clientsList];
    }
  }

  return (
    <OrdersClient
      key={`${currentPage}-${cleanQ}`}
      org={org}
      statuses={(statusesRes.data || []) as OrderStatus[]}
      initialOrders={normalizedOrders}
      totalCount={ordersRes.count ?? normalizedOrders.length}
      currentPage={currentPage}
      pageSize={PAGE_SIZE}
      initialSearch={cleanQ}
      initialView={view === 'list' ? 'list' : 'kanban'}
      clients={clientsList}
      products={(productsRes.data || []) as unknown as ProductRecord[]}
      warehouses={(warehousesRes.data || []) as Array<{ id: string; name: string; is_default: boolean }>}
      canViewCost={canViewCost}
      openNew={openNew === '1'}
      prefillClientId={prefillClientId || ''}
    />
  );
}
