import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';

interface IncomingBranding {
  method: 'dtf' | 'embroidery' | 'sublimation';
  print_zone_id: string | null;
  print_option_id: string | null;
  zone_name: string;
  width_cm?: number | null;
  height_cm?: number | null;
  roll_meters?: number | null;
  film_cost_total?: number;
  press_cost_total?: number;
  unit_cost: number;
  unit_price: number;
}

interface IncomingOrderItem {
  product_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  attributes: Record<string, string>;
  branding_method: 'none' | 'dtf' | 'embroidery' | 'sublimation';
  mockup_url: string | null;
  brandings: IncomingBranding[];
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      orgId: string;
      statusId: string | null;
      clientId: string | null;
      warehouseId: string | null;
      sourceName?: string;
      totalAmount: number;
      totalCost: number;
      ttn?: string | null;
      deliveryCity?: string | null;
      deliveryWarehouse?: string | null;
      notes?: string | null;
      items: IncomingOrderItem[];
    };

    const membership = ctx.memberships.find((m) => m.org_id === body.orgId);
    const hasAccess =
      ctx.profile?.is_super_admin ||
      membership?.role === 'owner' ||
      membership?.role === 'admin' ||
      Boolean(membership?.permissions?.orders);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const orderPayload = {
      status_id: body.statusId || null,
      client_id: body.clientId || null,
      warehouse_id: body.warehouseId || null,
      source_name: body.sourceName || 'CRM',
      total_amount: Number(body.totalAmount) || 0,
      total_cost: Number(body.totalCost) || 0,
      ttn: body.ttn?.trim() || null,
      delivery_city: body.deliveryCity?.trim() || null,
      delivery_warehouse: body.deliveryWarehouse?.trim() || null,
      notes: body.notes?.trim() || null,
    };

    const itemsPayload = (body.items || []).filter((i) => i.name?.trim());

    let createdOrderId: string | null = null;

    // 1. Try atomic Postgres RPC first (0014_enterprise_audit_and_atomic_orders.sql)
    const { data: rpcData, error: rpcErr } = await admin.rpc(
      'create_order_atomic',
      {
        p_org_id: body.orgId,
        p_user_id: ctx.user.id,
        p_user_email: ctx.user.email || null,
        p_order: orderPayload,
        p_items: itemsPayload,
      }
    );

    if (!rpcErr && rpcData && typeof rpcData === 'object' && 'id' in rpcData) {
      createdOrderId = String((rpcData as { id: string }).id);
    } else if (
      rpcErr &&
      !/PGRST202|42883|does not exist/i.test(rpcErr.message || '')
    ) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    } else {
      // Fallback if 0014 RPC is not yet applied
      const { data: ord, error: ordErr } = await admin
        .from('orders')
        .insert({ org_id: body.orgId, ...orderPayload })
        .select('id, order_number')
        .single();
      if (ordErr || !ord) {
        return NextResponse.json(
          { error: ordErr?.message || 'Failed to create order' },
          { status: 400 }
        );
      }
      createdOrderId = ord.id;

      if (itemsPayload.length > 0) {
        const { data: insertedItems } = await admin
          .from('order_items')
          .insert(
            itemsPayload.map((i) => ({
              org_id: body.orgId,
              order_id: ord.id,
              product_id: i.product_id || null,
              name: i.name.trim(),
              qty: Math.max(1, Number(i.qty) || 1),
              unit_price: Number(i.unit_price) || 0,
              unit_cost: Number(i.unit_cost) || 0,
              attributes: i.attributes || {},
            }))
          )
          .select('id');

        if (insertedItems && insertedItems.length > 0) {
          const brandingRows: Array<Record<string, unknown>> = [];
          itemsPayload.forEach((it, idx) => {
            const itemId = insertedItems[idx]?.id;
            if (!itemId) return;
            for (const b of it.brandings || []) {
              brandingRows.push({
                org_id: body.orgId,
                order_item_id: itemId,
                ...b,
              });
            }
          });
          if (brandingRows.length > 0) {
            await admin.from('order_item_brandings').insert(brandingRows);
          }
        }
      }

      await recordAuditLog({
        orgId: body.orgId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'order.created',
        entityType: 'order',
        entityId: ord.id,
        metadata: {
          order_number: ord.order_number,
          total_amount: orderPayload.total_amount,
          total_cost: orderPayload.total_cost,
          items_count: itemsPayload.length,
        },
      });
    }

    const { data: fullOrder } = await admin
      .from('orders')
      .select(
        'id, org_id, order_number, status_id, client_id, warehouse_id, stock_deducted, source_name, total_amount, total_cost, ttn, delivery_city, delivery_warehouse, notes, deadline, production_status, created_at, client:clients(id, contact_person, phone), order_items(id, name, qty, attributes)'
      )
      .eq('id', createdOrderId)
      .single();

    return NextResponse.json({ ok: true, order: fullOrder });
  } catch (err) {
    console.error('Create order error:', err);
    return NextResponse.json(
      { error: 'Внутрішня помилка сервера' },
      { status: 500 }
    );
  }
}
