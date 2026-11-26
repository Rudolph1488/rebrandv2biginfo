import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import CashflowClient from './CashflowClient';
import type { CashflowRecord } from '@/types/crm';

export default async function CashflowPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);

  if (!isAdmin && !permissions.cashflow) {
    redirect(`/w/${org.slug}`);
  }

  const supabase = await createClient();
  const { data: transactions } = await supabase
    .from('cashflow_transactions')
    .select('id, org_id, type, amount, category, order_id, comment, occurred_at, created_at')
    .eq('org_id', org.id)
    .order('occurred_at', { ascending: false })
    .limit(200);

  return (
    <CashflowClient
      org={org}
      initialTransactions={(transactions || []) as CashflowRecord[]}
    />
  );
}
