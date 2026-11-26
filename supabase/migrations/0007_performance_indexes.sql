-- Composite indexes for fast sorting and joins across CRM pages
create index if not exists idx_orders_org_created
  on public.orders(org_id, created_at desc);

create index if not exists idx_orders_org_updated
  on public.orders(org_id, updated_at desc);

create index if not exists idx_order_items_order_id
  on public.order_items(order_id);

create index if not exists idx_cashflow_org_occurred
  on public.cashflow_transactions(org_id, occurred_at desc);

create index if not exists idx_clients_org_created
  on public.clients(org_id, created_at desc);
