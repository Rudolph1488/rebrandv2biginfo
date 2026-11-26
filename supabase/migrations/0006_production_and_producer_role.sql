-- 1. Add 'producer' (Виробник) role to organization_members and organization_invites
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'manager', 'producer', 'viewer'));

alter table public.organization_invites
  drop constraint if exists organization_invites_role_check;

alter table public.organization_invites
  add constraint organization_invites_role_check
  check (role in ('owner', 'admin', 'manager', 'producer', 'viewer'));

-- 2. Add production tracking fields to orders
alter table public.orders
  add column if not exists production_status text not null default 'pending'
    check (production_status in ('pending', 'in_progress', 'done')),
  add column if not exists production_accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists production_accepted_at timestamptz,
  add column if not exists production_completed_at timestamptz;

create index if not exists idx_orders_org_production
  on public.orders(org_id, deadline, production_status)
  where deadline is not null;

-- 3. Database-level RLS access for 'production' and 'calendar' permissions
create policy "Production and calendar members can view orders"
  on public.orders for select
  using (
    public.has_org_permission(org_id, 'production')
    or public.has_org_permission(org_id, 'calendar')
  );

create policy "Production members can update production tasks"
  on public.orders for update
  using (public.has_org_permission(org_id, 'production'))
  with check (public.has_org_permission(org_id, 'production'));

create policy "Production and calendar members can view order items"
  on public.order_items for select
  using (
    public.has_org_permission(org_id, 'production')
    or public.has_org_permission(org_id, 'calendar')
  );
