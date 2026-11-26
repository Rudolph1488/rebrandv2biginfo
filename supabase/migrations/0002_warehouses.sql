-- ============================================================================
-- CENTRUM CRM v2 — Migration 0002: Warehouses, Stock & Movements (1C-style)
-- ============================================================================

-- 1. WAREHOUSES (Склади компанії та їхні правила)
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  type text not null default 'main' check (type in ('main', 'production', 'retail', 'defect')),
  address text,
  is_default boolean not null default false,
  allow_negative_stock boolean not null default false,
  auto_deduct_status_id uuid references public.order_statuses(id) on delete set null,
  min_stock_alert boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_warehouses_org_id on public.warehouses(org_id);

-- 2. WAREHOUSE STOCK (Поточні залишки по кожному складу)
create table if not exists public.warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(12,2) not null default 0,
  reserved_qty numeric(12,2) not null default 0,
  min_quantity numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

create index if not exists idx_warehouse_stock_org_id on public.warehouse_stock(org_id);

-- 3. STOCK MOVEMENTS (Документи руху товарів: прибуткування, списання, переміщення)
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_number serial,
  type text not null check (type in ('receipt', 'write_off', 'transfer', 'order_deduction', 'adjustment')),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  target_warehouse_id uuid references public.warehouses(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0,
  order_id uuid references public.orders(id) on delete set null,
  comment text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_org_id on public.stock_movements(org_id);

-- 4. RLS & GRANTS
alter table public.warehouses enable row level security;
alter table public.warehouse_stock enable row level security;
alter table public.stock_movements enable row level security;

create policy "Permitted members can view warehouses"
  on public.warehouses for select
  using (public.has_org_permission(org_id, 'warehouses') or public.has_org_permission(org_id, 'orders'));

create policy "Admins or warehouse managers can manage warehouses"
  on public.warehouses for all
  using (public.has_org_permission(org_id, 'warehouses'))
  with check (public.has_org_permission(org_id, 'warehouses'));

create policy "Permitted members can manage warehouse stock"
  on public.warehouse_stock for all
  using (public.has_org_permission(org_id, 'warehouses') or public.has_org_permission(org_id, 'products'))
  with check (public.has_org_permission(org_id, 'warehouses'));

create policy "Permitted members can manage stock movements"
  on public.stock_movements for all
  using (public.has_org_permission(org_id, 'warehouses'))
  with check (public.has_org_permission(org_id, 'warehouses'));

grant all on public.warehouses to authenticated, service_role;
grant all on public.warehouse_stock to authenticated, service_role;
grant all on public.stock_movements to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
