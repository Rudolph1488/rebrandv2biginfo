-- Product categories (folders) with branding mode per category
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  branding_mode text not null default 'none'
    check (branding_mode in ('none', 'apparel', 'sublimation')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists idx_product_categories_org
  on public.product_categories(org_id, position);

alter table public.product_categories enable row level security;

drop policy if exists "Members can view product categories" on public.product_categories;
create policy "Members can view product categories"
  on public.product_categories for select
  using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists "Permitted members can manage product categories" on public.product_categories;
create policy "Permitted members can manage product categories"
  on public.product_categories for all
  using (
    public.has_org_permission(org_id, 'products')
    or public.has_org_permission(org_id, 'settings')
  )
  with check (
    public.has_org_permission(org_id, 'products')
    or public.has_org_permission(org_id, 'settings')
  );

alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null;

create index if not exists idx_products_category
  on public.products(category_id);
