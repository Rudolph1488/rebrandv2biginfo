import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendOrgPushNotification } from '@/lib/push';

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { orgId, orderId, newStatusId } = (await request.json()) as {
      orgId: string;
      orderId: string;
      newStatusId: string;
    };

    const membership = ctx.memberships.find((m) => m.org_id === orgId);
    const hasAccess =
      ctx.profile?.is_super_admin ||
      membership?.role === 'owner' ||
      membership?.role === 'admin' ||
      Boolean(membership?.permissions?.orders);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: order, error: ordErr } = await admin
      .from('orders')
      .select('id, order_number, warehouse_id, stock_deducted')
      .eq('id', orderId)
      .eq('org_id', orgId)
      .single();

    if (ordErr || !order) {
      return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
    }

    let deductedNow = false;

    // Check if warehouse has auto-deduct rule for this status
    if (order.warehouse_id && !order.stock_deducted) {
      const { data: warehouse } = await admin
        .from('warehouses')
        .select('id, name, allow_negative_stock, auto_deduct_status_id')
        .eq('id', order.warehouse_id)
        .single();

      if (warehouse && warehouse.auto_deduct_status_id === newStatusId) {
        const { data: orderItems } = await admin
          .from('order_items')
          .select('product_id, name, qty')
          .eq('order_id', order.id)
          .not('product_id', 'is', null);

        const validItems = orderItems || [];

        // Validate stock availability if negative stock is forbidden
        if (!warehouse.allow_negative_stock && validItems.length > 0) {
          for (const item of validItems) {
            const { data: stockRow } = await admin
              .from('warehouse_stock')
              .select('quantity')
              .eq('warehouse_id', warehouse.id)
              .eq('product_id', item.product_id)
              .maybeSingle();

            const avail = Number(stockRow?.quantity ?? 0);
            if (avail < Number(item.qty)) {
              return NextResponse.json(
                {
                  error: `Недостатньо «${item.name}» на складі «${warehouse.name}» (доступно: ${avail}, потрібно: ${item.qty}).`,
                },
                { status: 400 }
              );
            }
          }
        }

        // Deduct each item
        for (const item of validItems) {
          const { data: stockRow } = await admin
            .from('warehouse_stock')
            .select('quantity')
            .eq('warehouse_id', warehouse.id)
            .eq('product_id', item.product_id)
            .maybeSingle();

          const nextQty = Number(stockRow?.quantity ?? 0) - Number(item.qty);

          await admin.from('warehouse_stock').upsert(
            {
              org_id: orgId,
              warehouse_id: warehouse.id,
              product_id: item.product_id,
              quantity: nextQty,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'warehouse_id,product_id' }
          );

          await admin.from('stock_movements').insert({
            org_id: orgId,
            type: 'order_deduction',
            warehouse_id: warehouse.id,
            product_id: item.product_id,
            quantity: Number(item.qty),
            order_id: order.id,
            comment: `Автосписання по замовленню #${order.order_number}`,
            created_by: ctx.user.id,
          });
        }

        deductedNow = true;
      }
    }

    await admin
      .from('orders')
      .update({
        status_id: newStatusId,
        stock_deducted: order.stock_deducted || deductedNow,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    // Notify Production if order moved into the 2nd stage ("Підтверджено")
    const { data: orgStages } = await admin
      .from('order_statuses')
      .select('id, name')
      .eq('org_id', orgId)
      .order('position', { ascending: true })
      .limit(2);

    if (orgStages && orgStages.length >= 2 && orgStages[1].id === newStatusId) {
      await sendOrgPushNotification({
        orgId,
        targetPermission: 'production',
        eventType: 'production_new_task',
        title: `🏭 Нова заявка #${order.order_number}`,
        body: `Замовлення переведено в «${orgStages[1].name}»`,
        url: membership?.organization?.slug
          ? `/w/${membership.organization.slug}/production`
          : '/',
      });
    }

    return NextResponse.json({
      ok: true,
      stockDeducted: order.stock_deducted || deductedNow,
      deductedNow,
    });
  } catch (err) {
    console.error('Order status update error:', err);
    return NextResponse.json(
      { error: 'Внутрішня помилка сервера' },
      { status: 500 }
    );
  }
}
