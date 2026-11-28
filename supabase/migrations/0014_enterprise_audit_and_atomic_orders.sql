-- Enterprise Audit Logs + Atomic Order Creation RPC (ACID)

-- 1. Audit Logs table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  user_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_org_created
  on public.audit_logs(org_id, created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs(entity_type, entity_id);

alter table public.audit_logs enable row level security;

drop policy if exists "Admins can view org audit logs" on public.audit_logs;
create policy "Admins can view org audit logs"
  on public.audit_logs for select
  using (
    public.is_org_admin(org_id)
    or public.has_org_permission(org_id, 'settings')
    or public.is_super_admin()
  );

grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

-- 2. Atomic Order Creation RPC (orders + order_items + order_item_brandings + audit_logs in 1 transaction)
create or replace function public.create_order_atomic(
  p_org_id uuid,
  p_user_id uuid,
  p_user_email text,
  p_order jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_branding jsonb;
  v_items_count integer := 0;
begin
  insert into public.orders (
    org_id,
    status_id,
    client_id,
    warehouse_id,
    source_name,
    total_amount,
    total_cost,
    ttn,
    delivery_city,
    delivery_warehouse,
    notes
  ) values (
    p_org_id,
    nullif(p_order->>'status_id', '')::uuid,
    nullif(p_order->>'client_id', '')::uuid,
    nullif(p_order->>'warehouse_id', '')::uuid,
    coalesce(nullif(p_order->>'source_name', ''), 'CRM'),
    coalesce((p_order->>'total_amount')::numeric, 0),
    coalesce((p_order->>'total_cost')::numeric, 0),
    nullif(p_order->>'ttn', ''),
    nullif(p_order->>'delivery_city', ''),
    nullif(p_order->>'delivery_warehouse', ''),
    nullif(p_order->>'notes', '')
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_items_count := v_items_count + 1;

    insert into public.order_items (
      org_id,
      order_id,
      product_id,
      name,
      qty,
      unit_price,
      unit_cost,
      attributes,
      branding_method,
      mockup_url
    ) values (
      p_org_id,
      v_order.id,
      nullif(v_item->>'product_id', '')::uuid,
      coalesce(nullif(v_item->>'name', ''), 'Товар'),
      greatest(1, coalesce((v_item->>'qty')::numeric, 1)),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'unit_cost')::numeric, 0),
      coalesce(v_item->'attributes', '{}'::jsonb),
      coalesce(nullif(v_item->>'branding_method', ''), 'none'),
      nullif(v_item->>'mockup_url', '')
    )
    returning id into v_item_id;

    for v_branding in select * from jsonb_array_elements(coalesce(v_item->'brandings', '[]'::jsonb))
    loop
      insert into public.order_item_brandings (
        org_id,
        order_item_id,
        method,
        print_zone_id,
        print_option_id,
        zone_name,
        width_cm,
        height_cm,
        roll_meters,
        film_cost_total,
        press_cost_total,
        unit_cost,
        unit_price
      ) values (
        p_org_id,
        v_item_id,
        coalesce(nullif(v_branding->>'method', ''), 'dtf'),
        nullif(v_branding->>'print_zone_id', '')::uuid,
        nullif(v_branding->>'print_option_id', '')::uuid,
        coalesce(nullif(v_branding->>'zone_name', ''), 'Зона'),
        (v_branding->>'width_cm')::numeric,
        (v_branding->>'height_cm')::numeric,
        (v_branding->>'roll_meters')::numeric,
        coalesce((v_branding->>'film_cost_total')::numeric, 0),
        coalesce((v_branding->>'press_cost_total')::numeric, 0),
        coalesce((v_branding->>'unit_cost')::numeric, 0),
        coalesce((v_branding->>'unit_price')::numeric, 0)
      );
    end loop;
  end loop;

  insert into public.audit_logs (
    org_id,
    user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_org_id,
    p_user_id,
    p_user_email,
    'order.created',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'total_amount', v_order.total_amount,
      'total_cost', v_order.total_cost,
      'items_count', v_items_count
    )
  );

  return to_jsonb(v_order);
end;
$$;

grant execute on function public.create_order_atomic(uuid, uuid, text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
