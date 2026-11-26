-- Add internal shipping/fulfillment deadline to orders for Calendar planning
alter table public.orders
  add column if not exists deadline date;

create index if not exists idx_orders_org_deadline
  on public.orders(org_id, deadline)
  where deadline is not null;
