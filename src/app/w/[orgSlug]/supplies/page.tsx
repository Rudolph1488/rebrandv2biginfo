import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import SuppliesClient from './SuppliesClient';
import type { ProductRecord } from '@/types/crm';

export default async function SuppliesPage({
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

  const [suppliesRes, warehousesRes, productsRes] = await Promise.all([
    supabase
      .from('supply_documents')
      .select('*, warehouse:warehouses(id, name)')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('warehouses')
      .select('id, name, is_default')
      .eq('org_id', org.id)
      .eq('is_active', true)
      .order('is_default', { ascending: false }),
    supabase
      .from('products')
      .select('id, name, sku, unit, cost_price, sale_price')
      .eq('org_id', org.id)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(200),
  ]);

  return (
    <SuppliesClient
      org={org}
      initialSupplies={(suppliesRes.data || []) as never}
      warehouses={(warehousesRes.data || []) as Array<{ id: string; name: string; is_default: boolean }>}
      products={(productsRes.data || []) as unknown as ProductRecord[]}
    />
  );
}
