-- Print / branding zone options per organization (for custom production pricing & cost)
create table if not exists public.print_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_print_options_org_id
  on public.print_options(org_id, position);

alter table public.print_options enable row level security;

drop policy if exists "Members can view print options" on public.print_options;
create policy "Members can view print options"
  on public.print_options for select
  using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists "Permitted members can manage print options" on public.print_options;
create policy "Permitted members can manage print options"
  on public.print_options for all
  using (
    public.has_org_permission(org_id, 'products')
    or public.has_org_permission(org_id, 'settings')
  )
  with check (
    public.has_org_permission(org_id, 'products')
    or public.has_org_permission(org_id, 'settings')
  );
