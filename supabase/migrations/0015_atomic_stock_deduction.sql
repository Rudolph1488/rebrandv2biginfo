-- Atomic stock deduction RPC with row-level locks (SELECT ... FOR UPDATE)
-- + allow org members to insert audit_logs for client-side cashflow/order edits

drop policy if exists "Members can insert org audit logs" on public.audit_logs;
create policy "Members can insert org audit logs"
  on public.audit_logs for insert
  with check (
    public.is_org_member(org_id)
    or public.is_super_admin()
  );

create or replace function public.deduct_order_stock_atomic(
  p_org_id uuid,
  p_order_id uuid,
  p_new_status_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_warehouse public.warehouses%rowtype;
  v_item record;
  v_avail numeric;
  v_next_qty numeric;
  v_deducted_now boolean := false;
begin
  -- Lock the order row so concurrent requests cannot double-deduct
  select *
  into v_order
  from public.orders
  where id = p_order_id and org_id = p_org_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'Замовлення не знайдено');
  end if;

  if v_order.warehouse_id is not null and not coalesce(v_order.stock_deducted, false) then
    select *
    into v_warehouse
    from public.warehouses
    where id = v_order.warehouse_id and org_id = p_org_id;

    if found and v_warehouse.auto_deduct_status_id = p_new_status_id then
      -- First pass: lock stock rows in deterministic product_id order and validate
      for v_item in
        select oi.product_id, max(oi.name) as name, sum(oi.qty) as total_qty
        from public.order_items oi
        where oi.order_id = v_order.id and oi.product_id is not null
        group by oi.product_id
        order by oi.product_id
      loop
        select quantity
        into v_avail
        from public.warehouse_stock
        where warehouse_id = v_warehouse.id and product_id = v_item.product_id
        for update;

        v_avail := coalesce(v_avail, 0);

        if not coalesce(v_warehouse.allow_negative_stock, false) and v_avail < v_item.total_qty then
          return jsonb_build_object(
            'ok', false,
            'status', 400,
            'error', format(
              'Недостатньо «%s» на складі «%s» (доступно: %s, потрібно: %s).',
              v_item.name, v_warehouse.name, v_avail, v_item.total_qty
            )
          );
        end if;
      end loop;

      -- Second pass: deduct stock and record stock_movements
      for v_item in
        select oi.product_id, sum(oi.qty) as total_qty
        from public.order_items oi
        where oi.order_id = v_order.id and oi.product_id is not null
        group by oi.product_id
        order by oi.product_id
      loop
        select quantity
        into v_avail
        from public.warehouse_stock
        where warehouse_id = v_warehouse.id and product_id = v_item.product_id
        for update;

        v_next_qty := coalesce(v_avail, 0) - v_item.total_qty;

        insert into public.warehouse_stock (org_id, warehouse_id, product_id, quantity, updated_at)
        values (p_org_id, v_warehouse.id, v_item.product_id, v_next_qty, now())
        on conflict (warehouse_id, product_id)
        do update set quantity = excluded.quantity, updated_at = now();

        insert into public.stock_movements (
          org_id, type, warehouse_id, product_id, quantity, order_id, comment, created_by
        ) values (
          p_org_id,
          'order_deduction',
          v_warehouse.id,
          v_item.product_id,
          v_item.total_qty,
          v_order.id,
          format('Автосписання по замовленню #%s', v_order.order_number),
          p_user_id
        );
      end loop;

      v_deducted_now := true;
    end if;
  end if;

  update public.orders
  set
    status_id = p_new_status_id,
    stock_deducted = coalesce(v_order.stock_deducted, false) or v_deducted_now,
    updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'order_number', v_order.order_number,
    'stock_deducted', coalesce(v_order.stock_deducted, false) or v_deducted_now,
    'deducted_now', v_deducted_now
  );
end;
$$;

grant execute on function public.deduct_order_stock_atomic(uuid, uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
