import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import ProductsClient from './ProductsClient';
import type { ProductRecord } from '@/types/crm';

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

  const columns = canViewCost
    ? 'id, org_id, name, sku, category, sale_price, cost_price, unit, is_active, created_at'
    : 'id, org_id, name, sku, category, sale_price, unit, is_active, created_at';

  const { data: products } = await supabase
    .from('products')
    .select(columns)
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <ProductsClient
      org={org}
      initialProducts={(products || []) as unknown as ProductRecord[]}
      canViewCost={canViewCost}
      canManage={isAdmin || permissions.products}
    />
  );
}
