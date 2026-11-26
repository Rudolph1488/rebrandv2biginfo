-- ============================================================================
-- CENTRUM CRM v2 — Migration 0003: Supply Documents & Order Warehouse Link
-- ============================================================================

-- 1. Link orders to a warehouse and track automatic deduction
alter table public.orders
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null,
  add column if not exists stock_deducted boolean not null default false;

-- 2. Supply Documents (Документи постачання / прийомки на склад)
create table if not exists public.supply_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_number serial,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  supplier_name text not null,
  invoice_number text,
  total_amount numeric(12,2) not null default 0,
  record_cashflow boolean not null default false,
  comment text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supply_documents_org_id on public.supply_documents(org_id);

alter table public.supply_documents enable row level security;

create policy "Permitted members can manage supply documents"
  on public.supply_documents for all
  using (public.has_org_permission(org_id, 'warehouses'))
  with check (public.has_org_permission(org_id, 'warehouses'));

grant all on public.supply_documents to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
