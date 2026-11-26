-- ============================================================================
-- CENTRUM CRM v2 — Multi-Tenant SaaS Initial Schema & RLS
-- ============================================================================

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ============================================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. ORGANIZATIONS (Tenants / Studios)
-- ============================================================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text not null default '#2563eb',
  currency text not null default 'UAH',
  onboarding_completed boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 3. ORGANIZATION MEMBERS & GRANULAR PERMISSIONS
-- ============================================================================
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'manager' check (role in ('owner', 'admin', 'manager', 'viewer')),
  permissions jsonb not null default '{
    "orders": true,
    "clients": true,
    "products": true,
    "view_cost_price": false,
    "cashflow": false,
    "settings": false
  }'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ============================================================================
-- 4. ORGANIZATION INVITES (Closed Invite-Only Start)
-- ============================================================================
create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'manager' check (role in ('owner', 'admin', 'manager', 'viewer')),
  permissions jsonb not null default '{
    "orders": true,
    "clients": true,
    "products": true,
    "view_cost_price": false,
    "cashflow": false,
    "settings": false
  }'::jsonb,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 5. ORDER STATUSES (Custom Kanban Columns per Organization)
-- ============================================================================
create table if not exists public.order_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#64748b',
  position integer not null default 0,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- ============================================================================
-- 6. CLIENTS
-- ============================================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_person text not null,
  company_name text,
  phone text,
  email text,
  telegram_chat_id text,
  telegram_username text,
  np_city_ref text,
  np_city_name text,
  np_warehouse_ref text,
  np_warehouse_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_org_id on public.clients(org_id);
create index if not exists idx_clients_name_trgm on public.clients using gin (contact_person gin_trgm_ops);
create index if not exists idx_clients_phone_trgm on public.clients using gin (phone gin_trgm_ops);

-- ============================================================================
-- 7. PRODUCTS (Nomenclature with Cost Price)
-- ============================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  sale_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  unit text not null default 'шт',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_org_id on public.products(org_id);

-- ============================================================================
-- 8. INTEGRATION CHANNELS (Multi-site / Telegram / Nova Poshta per Org)
-- ============================================================================
create table if not exists public.integration_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('novaposhta', 'telegram', 'weblium', 'b2b', 'custom_webhook')),
  name text not null,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_channels_org_id on public.integration_channels(org_id);

-- ============================================================================
-- 9. ORDERS & ORDER ITEMS
-- ============================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_number serial,
  status_id uuid references public.order_statuses(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  channel_id uuid references public.integration_channels(id) on delete set null,
  source_name text not null default 'CRM',
  external_id text,
  total_amount numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  ttn text,
  delivery_city text,
  delivery_warehouse text,
  notes text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_org_id on public.orders(org_id);
create index if not exists idx_orders_status_id on public.orders(status_id);
create index if not exists idx_orders_client_id on public.orders(client_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  qty numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- ============================================================================
-- 10. CASHFLOW TRANSACTIONS
-- ============================================================================
create table if not exists public.cashflow_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount >= 0),
  category text not null default 'Інше',
  order_id uuid references public.orders(id) on delete set null,
  comment text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cashflow_org_id on public.cashflow_transactions(org_id);

-- ============================================================================
-- 11. RLS HELPER FUNCTIONS
-- ============================================================================
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_super_admin = true
  );
$$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.organization_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.has_org_permission(target_org_id uuid, perm_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_admin(target_org_id) or exists (
    select 1 from public.organization_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and coalesce((permissions ->> perm_key)::boolean, false) = true
  );
$$;

-- ============================================================================
-- 12. ENABLE ROW LEVEL SECURITY & POLICIES
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.order_statuses enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.integration_channels enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.cashflow_transactions enable row level security;

-- Profiles
create policy "Users can view own profile or org teammates"
  on public.profiles for select
  using (
    id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1 from public.organization_members m1
      join public.organization_members m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Organizations
create policy "Members and superadmin can view organizations"
  on public.organizations for select
  using (public.is_org_member(id) or public.is_super_admin());

create policy "Superadmin can insert organizations"
  on public.organizations for insert
  with check (public.is_super_admin());

create policy "Org admins and superadmin can update organizations"
  on public.organizations for update
  using (public.is_org_admin(id));

-- Organization Members
create policy "Members can view org teammates"
  on public.organization_members for select
  using (public.is_org_member(org_id) or public.is_super_admin());

create policy "Org admins can manage org members"
  on public.organization_members for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- Organization Invites
create policy "Org admins can manage invites"
  on public.organization_invites for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- Order Statuses
create policy "Members can view order statuses"
  on public.order_statuses for select
  using (public.is_org_member(org_id) or public.is_super_admin());

create policy "Org admins can manage order statuses"
  on public.order_statuses for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- Clients
create policy "Permitted members can manage clients"
  on public.clients for all
  using (public.has_org_permission(org_id, 'clients'))
  with check (public.has_org_permission(org_id, 'clients'));

-- Products
create policy "Permitted members can manage products"
  on public.products for all
  using (public.has_org_permission(org_id, 'products'))
  with check (public.has_org_permission(org_id, 'products'));

-- Integration Channels (Admins only, protects API keys/tokens)
create policy "Only org admins can view and manage integrations"
  on public.integration_channels for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- Orders & Order Items
create policy "Permitted members can manage orders"
  on public.orders for all
  using (public.has_org_permission(org_id, 'orders'))
  with check (public.has_org_permission(org_id, 'orders'));

create policy "Permitted members can manage order items"
  on public.order_items for all
  using (public.has_org_permission(org_id, 'orders'))
  with check (public.has_org_permission(org_id, 'orders'));

-- Cashflow
create policy "Permitted members can manage cashflow"
  on public.cashflow_transactions for all
  using (public.has_org_permission(org_id, 'cashflow'))
  with check (public.has_org_permission(org_id, 'cashflow'));

-- ============================================================================
-- 13. STORAGE BUCKETS (Logos & Order Files)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;

create policy "Public read access for org logos"
  on storage.objects for select
  using (bucket_id = 'org-logos');

create policy "Authenticated users can upload org logos"
  on storage.objects for insert
  with check (bucket_id = 'org-logos' and auth.role() = 'authenticated');
