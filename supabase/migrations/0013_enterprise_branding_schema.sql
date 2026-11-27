-- Enterprise normalized branding schema: print zones dictionary + structured order item brandings

-- 1. Standard print zones dictionary (ID-referenced, configurable per org)
create table if not exists public.print_zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  default_width_cm numeric(8,2) not null default 10,
  default_height_cm numeric(8,2) not null default 10,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists idx_print_zones_org
  on public.print_zones(org_id, position)
  where is_active = true;

alter table public.print_zones enable row level security;

drop policy if exists "Members can view print zones" on public.print_zones;
create policy "Members can view print zones"
  on public.print_zones for select
  using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists "Permitted members can manage print zones" on public.print_zones;
create policy "Permitted members can manage print zones"
  on public.print_zones for all
  using (
    public.has_org_permission(org_id, 'products')
    or public.has_org_permission(org_id, 'settings')
  )
  with check (
    public.has_org_permission(org_id, 'products')
    or public.has_org_permission(org_id, 'settings')
  );

-- 2. Extend order_items with structured branding method and mockup_url
alter table public.order_items
  add column if not exists branding_method text not null default 'none'
    check (branding_method in ('none', 'dtf', 'embroidery', 'sublimation')),
  add column if not exists mockup_url text;

-- 3. Normalized order_item_brandings table (ID-bound to order_items, print_zones, print_options)
create table if not exists public.order_item_brandings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  method text not null check (method in ('dtf', 'embroidery', 'sublimation')),
  print_zone_id uuid references public.print_zones(id) on delete set null,
  print_option_id uuid references public.print_options(id) on delete set null,
  zone_name text not null,
  width_cm numeric(8,2),
  height_cm numeric(8,2),
  roll_meters numeric(10,3),
  film_cost_total numeric(12,2) not null default 0,
  press_cost_total numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_item_brandings_item
  on public.order_item_brandings(order_item_id);

create index if not exists idx_order_item_brandings_org
  on public.order_item_brandings(org_id, method, created_at desc);

alter table public.order_item_brandings enable row level security;

drop policy if exists "Members can view order item brandings" on public.order_item_brandings;
create policy "Members can view order item brandings"
  on public.order_item_brandings for select
  using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists "Permitted members can manage order item brandings" on public.order_item_brandings;
create policy "Permitted members can manage order item brandings"
  on public.order_item_brandings for all
  using (
    public.has_org_permission(org_id, 'orders')
    or public.has_org_permission(org_id, 'production')
  )
  with check (
    public.has_org_permission(org_id, 'orders')
    or public.has_org_permission(org_id, 'production')
  );
