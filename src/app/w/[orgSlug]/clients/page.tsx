import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import ClientsClient from './ClientsClient';
import type { ClientRecord } from '@/types/crm';

const PAGE_SIZE = 50;

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const { q = '', page = '1' } = await searchParams;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.clients) {
    redirect(`/w/${org.slug}`);
  }

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const cleanQ = q.trim();

  const supabase = await createClient();
  let query = supabase
    .from('clients')
    .select(
      'id, org_id, contact_person, company_name, phone, email, np_city_name, np_warehouse_name, created_at',
      { count: 'exact' }
    )
    .eq('org_id', org.id);

  if (cleanQ) {
    query = query.or(
      `contact_person.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%,company_name.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%`
    );
  }

  const { data: clients, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  return (
    <ClientsClient
      key={`${currentPage}-${cleanQ}`}
      org={org}
      initialClients={(clients || []) as ClientRecord[]}
      totalCount={count ?? 0}
      currentPage={currentPage}
      pageSize={PAGE_SIZE}
      initialSearch={cleanQ}
      canDelete={isAdmin}
    />
  );
}
