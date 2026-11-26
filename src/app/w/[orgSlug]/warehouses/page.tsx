import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import WarehousesClient from './WarehousesClient';
import type {
  OrderStatus,
  ProductRecord,
  StockMovementRecord,
  WarehouseRecord,
  WarehouseStockRecord,
} from '@/types/crm';

export default async function WarehousesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.warehouses) {
    redirect(`/w/${org.slug}`);
  }

  const supabase = await createClient();

  const [warehousesRes, stockRes, movementsRes, productsRes, statusesRes] =
    await Promise.all([
      supabase
        .from('warehouses')
        .select('*')
        .eq('org_id', org.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('warehouse_stock')
        .select(
          'id, org_id, warehouse_id, product_id, quantity, reserved_qty, min_quantity, updated_at, product:products(id, name, sku, unit), warehouse:warehouses(id, name)'
        )
        .eq('org_id', org.id)
        .limit(200),
      supabase
        .from('stock_movements')
        .select(
          'id, org_id, doc_number, type, warehouse_id, target_warehouse_id, product_id, quantity, unit_cost, comment, created_at, product:products(name, unit), warehouse:warehouses!stock_movements_warehouse_id_fkey(name), target_warehouse:warehouses!stock_movements_target_warehouse_id_fkey(name)'
        )
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('products')
        .select('id, name, sku, unit, sale_price')
        .eq('org_id', org.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(200),
      supabase
        .from('order_statuses')
        .select('*')
        .eq('org_id', org.id)
        .order('position', { ascending: true }),
    ]);

  return (
    <WarehousesClient
      org={org}
      isAdmin={isAdmin}
      initialWarehouses={(warehousesRes.data || []) as WarehouseRecord[]}
      initialStock={(stockRes.data || []) as unknown as WarehouseStockRecord[]}
      initialMovements={
        (movementsRes.data || []) as unknown as StockMovementRecord[]
      }
      products={(productsRes.data || []) as unknown as ProductRecord[]}
      statuses={(statusesRes.data || []) as OrderStatus[]}
    />
  );
}
