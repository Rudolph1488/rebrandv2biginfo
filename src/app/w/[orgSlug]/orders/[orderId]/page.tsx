import { notFound, redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import OrderDetailClient from './OrderDetailClient';
import type {
  CashflowRecord,
  OrderItemBrandingRecord,
  OrderRecord,
  OrderStatus,
  PrintOptionRecord,
  PrintZoneRecord,
  ProductCategoryRecord,
  ProductRecord,
} from '@/types/crm';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; orderId: string }>;
}) {
  const { orgSlug, orderId } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.orders) {
    redirect(`/w/${org.slug}`);
  }

  const canViewCost = isAdmin || permissions.view_cost_price;
  const canCashflow = isAdmin || permissions.cashflow;
  const supabase = await createClient();

  const [orderRes, itemsRes, statusesRes, productsRes, warehousesRes, cashRes, categoriesRes, printOptsRes, printZonesRes] =
    await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, total_cost, ttn, delivery_city, delivery_warehouse, notes, deadline, production_status, production_elapsed_seconds, created_at, client:clients(id, contact_person, phone, company_name)'
        )
        .eq('id', orderId)
        .eq('org_id', org.id)
        .single(),
      supabase
        .from('order_items')
        .select('id, product_id, name, qty, unit_price, unit_cost, attributes')
        .eq('order_id', orderId)
        .eq('org_id', org.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('order_statuses')
        .select('*')
        .eq('org_id', org.id)
        .order('position', { ascending: true }),
      supabase
        .from('products')
        .select(
          canViewCost
            ? 'id, name, category_id, sale_price, cost_price, unit'
            : 'id, name, category_id, sale_price, unit'
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
      supabase
        .from('cashflow_transactions')
        .select('id, org_id, type, amount, category, order_id, comment, occurred_at, created_at')
        .eq('org_id', org.id)
        .eq('order_id', orderId)
        .order('occurred_at', { ascending: false }),
      supabase
        .from('product_categories')
        .select('id, org_id, name, branding_mode, position, created_at')
        .eq('org_id', org.id)
        .order('position', { ascending: true }),
      supabase
        .from('print_options')
        .select(
          canViewCost
            ? 'id, org_id, name, price, cost_price, is_active, position, created_at'
            : 'id, org_id, name, price, is_active, position, created_at'
        )
        .eq('org_id', org.id)
        .eq('is_active', true)
        .order('position', { ascending: true }),
      supabase
        .from('print_zones')
        .select(
          'id, org_id, name, default_width_cm, default_height_cm, position, is_active, created_at'
        )
        .eq('org_id', org.id)
        .eq('is_active', true)
        .order('position', { ascending: true }),
    ]);

  if (!orderRes.data) {
    notFound();
  }

  const itemIds = (itemsRes.data || []).map((i) => i.id);
  const brandingsRes =
    itemIds.length > 0
      ? await supabase
          .from('order_item_brandings')
          .select('*')
          .eq('org_id', org.id)
          .in('order_item_id', itemIds)
      : { data: [] };

  const normalizedOrder = {
    ...orderRes.data,
    total_cost: canViewCost ? orderRes.data.total_cost : undefined,
    client: Array.isArray(orderRes.data.client)
      ? orderRes.data.client[0]
      : orderRes.data.client,
  } as unknown as OrderRecord;

  return (
    <OrderDetailClient
      org={org}
      initialOrder={normalizedOrder}
      initialItems={itemsRes.data || []}
      initialBrandings={
        (brandingsRes.data || []) as OrderItemBrandingRecord[]
      }
      statuses={(statusesRes.data || []) as OrderStatus[]}
      products={(productsRes.data || []) as unknown as ProductRecord[]}
      productCategories={
        (categoriesRes.data || []) as unknown as ProductCategoryRecord[]
      }
      printOptions={
        (printOptsRes.data || []) as unknown as PrintOptionRecord[]
      }
      printZones={
        (printZonesRes.data || []) as unknown as PrintZoneRecord[]
      }
      warehouses={(warehousesRes.data || []) as Array<{ id: string; name: string; is_default: boolean }>}
      initialPayments={(cashRes.data || []) as CashflowRecord[]}
      canViewCost={canViewCost}
      canCashflow={canCashflow}
      canDelete={isAdmin}
    />
  );
}
