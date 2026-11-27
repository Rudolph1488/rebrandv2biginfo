import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import ProductsClient from './ProductsClient';
import type {
  PrintOptionRecord,
  ProductCategoryRecord,
  ProductRecord,
  WarehouseStockRecord,
} from '@/types/crm';

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.products) {
    redirect(`/w/${org.slug}`);
  }

  const canViewCost = isAdmin || permissions.view_cost_price;
  const supabase = await createClient();

  const categoriesRes = await supabase
    .from('product_categories')
    .select('id, org_id, name, branding_mode, position, created_at')
    .eq('org_id', org.id)
    .order('position', { ascending: true })
    .order('name', { ascending: true });

  const categoriesMigrationMissing = Boolean(categoriesRes.error);

  const columns = [
    'id',
    'org_id',
    'name',
    'sku',
    'category',
    ...(categoriesMigrationMissing ? [] : ['category_id']),
    'sale_price',
    ...(canViewCost ? ['cost_price'] : []),
    'unit',
    'is_active',
    'created_at',
  ].join(', ');

  const optColumns = canViewCost
    ? 'id, org_id, name, price, cost_price, is_active, position, created_at'
    : 'id, org_id, name, price, is_active, position, created_at';

  const [productsRes, optionsRes, stockRes] = await Promise.all([
    supabase
      .from('products')
      .select(columns)
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('print_options')
      .select(optColumns)
      .eq('org_id', org.id)
      .order('position', { ascending: true }),
    supabase
      .from('warehouse_stock')
      .select(
        'id, org_id, warehouse_id, product_id, quantity, reserved_qty, min_quantity, updated_at, warehouse:warehouses(id, name)'
      )
      .eq('org_id', org.id),
  ]);

  return (
    <ProductsClient
      org={org}
      initialProducts={(productsRes.data || []) as unknown as ProductRecord[]}
      initialCategories={
        (categoriesRes.data || []) as unknown as ProductCategoryRecord[]
      }
      initialStock={
        (stockRes.data || []) as unknown as WarehouseStockRecord[]
      }
      initialPrintOptions={
        (optionsRes.data || []) as unknown as PrintOptionRecord[]
      }
      printOptionsMigrationMissing={Boolean(optionsRes.error)}
      categoriesMigrationMissing={categoriesMigrationMissing}
      canViewCost={canViewCost}
      canManage={isAdmin || permissions.products}
    />
  );
}
