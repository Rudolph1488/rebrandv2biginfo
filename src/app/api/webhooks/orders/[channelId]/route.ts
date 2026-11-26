import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function parseAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'string') {
    const num = parseFloat(val.replace(/[^0-9,.]/g, '').replace(',', '.'));
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function parseWebliumAddress(rawAddress?: string): {
  city: string;
  warehouse: string;
} {
  if (!rawAddress) return { city: '', warehouse: '' };
  const match = rawAddress.match(/(Відділення|Поштомат)/i);
  if (match && match.index !== undefined) {
    const city = rawAddress
      .substring(0, match.index)
      .trim()
      .replace(/[,.]+$/, '')
      .trim();
    const warehouse = rawAddress.substring(match.index).trim();
    return { city, warehouse };
  }
  const parts = rawAddress.split(',');
  if (parts.length > 1) {
    return {
      city: parts[0].trim(),
      warehouse: parts.slice(1).join(',').trim(),
    };
  }
  return { city: rawAddress.trim(), warehouse: '' };
}

async function recordOrderPaidCashflow(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    orgId: string;
    orderId: string;
    orderNumber: number;
    paidAmount: number;
    channelName: string;
    externalCode?: string | number | null;
  }
) {
  if (params.paidAmount <= 0) return { recorded: false, amountAdded: 0 };

  // Avoid duplicate cashflow entries if Weblium retries the webhook
  const { data: existingPayments } = await admin
    .from('cashflow_transactions')
    .select('amount')
    .eq('org_id', params.orgId)
    .eq('order_id', params.orderId)
    .eq('type', 'income');

  const alreadyPaid = (existingPayments || []).reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  const toAdd = Math.max(0, Number((params.paidAmount - alreadyPaid).toFixed(2)));
  if (toAdd <= 0) return { recorded: false, amountAdded: 0 };

  const codeSuffix = params.externalCode ? ` (${params.externalCode})` : '';
  const { error } = await admin.from('cashflow_transactions').insert({
    org_id: params.orgId,
    type: 'income',
    amount: toAdd,
    category: 'Оплата замовлення',
    order_id: params.orderId,
    comment: `Онлайн-оплата (${params.channelName}) по замовленню #${params.orderNumber}${codeSuffix}`,
    occurred_at: new Date().toISOString(),
  });

  return { recorded: !error, amountAdded: error ? 0 : toAdd };
}

async function advanceOrderFromFirstStage(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  orderId: string,
  currentStatusId: string | null
) {
  const { data: stages } = await admin
    .from('order_statuses')
    .select('id, position')
    .eq('org_id', orgId)
    .order('position', { ascending: true })
    .limit(2);

  if (
    stages &&
    stages.length >= 2 &&
    (!currentStatusId || currentStatusId === stages[0].id)
  ) {
    await admin
      .from('orders')
      .update({ status_id: stages[1].id })
      .eq('id', orderId);
  }
}

async function findOrCreateProduct(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  channelName: string,
  item: {
    name?: string;
    sku?: string;
    unitPrice?: number;
    price?: number;
    attributes?: Record<string, string>;
  },
  cache: Map<string, { id: string; costPrice: number }>
): Promise<{ id: string | null; costPrice: number }> {
  const cleanName = (item.name || 'Товар').trim();
  const cleanSku = (item.sku || item.attributes?.['Артикул'] || '').trim() || null;
  const cacheKey = `${cleanSku || ''}::${cleanName.toLowerCase()}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 1. Try matching by SKU first (if present)
  if (cleanSku) {
    const { data: bySku } = await admin
      .from('products')
      .select('id, cost_price')
      .eq('org_id', orgId)
      .eq('sku', cleanSku)
      .limit(1)
      .maybeSingle();

    if (bySku) {
      const hit = { id: bySku.id, costPrice: Number(bySku.cost_price) || 0 };
      cache.set(cacheKey, hit);
      return hit;
    }
  }

  // 2. Try matching by exact name (case-insensitive)
  const { data: byName } = await admin
    .from('products')
    .select('id, cost_price')
    .eq('org_id', orgId)
    .ilike('name', cleanName)
    .limit(1)
    .maybeSingle();

  if (byName) {
    const hit = { id: byName.id, costPrice: Number(byName.cost_price) || 0 };
    cache.set(cacheKey, hit);
    return hit;
  }

  // 3. Auto-create missing product in catalog
  const salePrice = Number(item.unitPrice ?? item.price ?? 0);
  const { data: created } = await admin
    .from('products')
    .insert({
      org_id: orgId,
      name: cleanName,
      sku: cleanSku,
      category: channelName || 'Із сайту',
      sale_price: salePrice,
      cost_price: 0,
      unit: 'шт',
      is_active: true,
    })
    .select('id, cost_price')
    .single();

  if (created) {
    const hit = { id: created.id, costPrice: Number(created.cost_price) || 0 };
    cache.set(cacheKey, hit);
    return hit;
  }

  return { id: null, costPrice: 0 };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const admin = createAdminClient();

    const { data: channel, error: chErr } = await admin
      .from('integration_channels')
      .select('id, org_id, type, name, is_active, webhook_secret')
      .eq('id', channelId)
      .eq('is_active', true)
      .single();

    if (chErr || !channel) {
      return NextResponse.json(
        { error: 'Канал не знайдено або вимкнено' },
        { status: 404 }
      );
    }

    const apiKeyHeader = request.headers.get('x-api-key');
    if (
      channel.type !== 'weblium' &&
      apiKeyHeader !== channel.webhook_secret
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const event = typeof body.event === 'string' ? body.event : null;
    const isPaidEvent =
      event === 'order_paid' ||
      body.paid === true ||
      body.isPaid === true ||
      body.payment_status === 'paid';

    const externalId =
      body.externalId || body.order?.id?.toString() || body.orderId || null;

    // Check if order with this externalId already exists in this org
    if (externalId) {
      const { data: existingOrder } = await admin
        .from('orders')
        .select('id, order_number, status_id, total_amount')
        .eq('org_id', channel.org_id)
        .eq('external_id', String(externalId))
        .limit(1)
        .maybeSingle();

      if (existingOrder) {
        if (isPaidEvent) {
          const paidAmount =
            parseAmount(body.order?.formatted?.total_amount) ||
            Number(body.totalSum) ||
            Number(existingOrder.total_amount) ||
            0;

          const { amountAdded } = await recordOrderPaidCashflow(admin, {
            orgId: channel.org_id,
            orderId: existingOrder.id,
            orderNumber: existingOrder.order_number,
            paidAmount,
            channelName: channel.name,
            externalCode: body.order?.code,
          });

          await advanceOrderFromFirstStage(
            admin,
            channel.org_id,
            existingOrder.id,
            existingOrder.status_id
          );

          return NextResponse.json({
            ok: true,
            event: 'order_paid',
            orderId: existingOrder.id,
            orderNumber: existingOrder.order_number,
            cashflowAdded: amountAdded,
          });
        }

        return NextResponse.json({
          ok: true,
          duplicate: true,
          orderId: existingOrder.id,
          orderNumber: existingOrder.order_number,
        });
      }
    }

    // If order_paid arrived without payload to create the order
    if (event === 'order_paid' && !body.order && !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: 'Замовлення не знайдено для зарахування оплати' },
        { status: 404 }
      );
    }

    // Support both Weblium format and generic B2B / custom format
    const contactPerson =
      body.client?.name ||
      body.order?.custom_fields?.["Ім'я та прізвище"] ||
      body.customerName ||
      'Клієнт із сайту';

    const phone =
      body.client?.phone ||
      body.order?.custom_fields?.['Телефон'] ||
      body.customerPhone ||
      null;

    const parsedWebliumAddr = parseWebliumAddress(
      body.order?.shipment?.address_custom
    );
    const deliveryCity =
      body.deliveryCity || parsedWebliumAddr.city || null;
    const deliveryWarehouse =
      body.deliveryWarehouse || parsedWebliumAddr.warehouse || null;

    // 1. Find or create client inside this organization
    let clientId: string | null = null;
    if (phone) {
      const { data: existingClient } = await admin
        .from('clients')
        .select('id')
        .eq('org_id', channel.org_id)
        .eq('phone', String(phone))
        .limit(1)
        .maybeSingle();

      if (existingClient) {
        clientId = existingClient.id;
      }
    }

    if (!clientId) {
      const { data: createdClient } = await admin
        .from('clients')
        .insert({
          org_id: channel.org_id,
          contact_person: String(contactPerson),
          company_name: body.client?.companyName || null,
          phone: phone ? String(phone) : null,
          np_city_name: deliveryCity,
          np_warehouse_name: deliveryWarehouse,
        })
        .select('id')
        .single();
      clientId = createdClient?.id || null;
    }

    // 2. Get Kanban stages for this org (first stage by default, second if already paid)
    const { data: stages } = await admin
      .from('order_statuses')
      .select('id')
      .eq('org_id', channel.org_id)
      .order('position', { ascending: true })
      .limit(2);

    const targetStatusId =
      isPaidEvent && stages && stages.length >= 2
        ? stages[1].id
        : stages?.[0]?.id || null;

    // 3. Parse items & total (preserving Weblium variants/options like Size, Color, SKU)
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.order?.products)
        ? body.order.products.map(
          (p: {
            name: string;
            qty: number;
            amount: number;
            sku?: string;
            variant?: string;
            options?: Array<{ name?: string; title?: string; value?: string }>;
          }) => {
            const attrs: Record<string, string> = {};
            if (p.sku) attrs['Артикул'] = String(p.sku);
            if (p.variant) attrs['Варіант'] = String(p.variant);
            if (Array.isArray(p.options)) {
              for (const opt of p.options) {
                const k = opt.name || opt.title;
                if (k && opt.value) attrs[String(k)] = String(opt.value);
              }
            }
            return {
              name: p.name,
              qty: p.qty || 1,
              unitPrice: (p.amount || 0) / 100,
              attributes: attrs,
            };
          }
        )
        : [];

    const totalAmount =
      Number(body.totalSum) ||
      parseAmount(body.order?.formatted?.total_amount) ||
      rawItems.reduce(
        (s: number, i: { qty?: number; unitPrice?: number; price?: number }) =>
          s + Number(i.qty || 1) * Number(i.unitPrice ?? i.price ?? 0),
        0
      );

    // 4. Create order
    const { data: order, error: ordErr } = await admin
      .from('orders')
      .insert({
        org_id: channel.org_id,
        status_id: targetStatusId,
        client_id: clientId,
        channel_id: channel.id,
        source_name: channel.name,
        external_id: externalId ? String(externalId) : null,
        total_amount: totalAmount,
        delivery_city: deliveryCity,
        delivery_warehouse: deliveryWarehouse,
        notes: body.notes || null,
      })
      .select('id, order_number')
      .single();

    if (ordErr || !order) {
      return NextResponse.json(
        { error: ordErr?.message || 'Помилка створення замовлення' },
        { status: 500 }
      );
    }

    if (rawItems.length > 0) {
      const productCache = new Map<string, { id: string; costPrice: number }>();
      const preparedItems: Array<{
        org_id: string;
        order_id: string;
        product_id: string | null;
        name: string;
        qty: number;
        unit_price: number;
        unit_cost: number;
        attributes: Record<string, string>;
      }> = [];

      let totalCost = 0;

      for (const i of rawItems as Array<{
        name?: string;
        sku?: string;
        qty?: number;
        unitPrice?: number;
        price?: number;
        attributes?: Record<string, string>;
      }>) {
        const matched = await findOrCreateProduct(
          admin,
          channel.org_id,
          channel.name,
          i,
          productCache
        );
        const qty = Number(i.qty || 1);
        totalCost += qty * matched.costPrice;

        preparedItems.push({
          org_id: channel.org_id,
          order_id: order.id,
          product_id: matched.id,
          name: (i.name || 'Товар').trim(),
          qty,
          unit_price: Number(i.unitPrice ?? i.price ?? 0),
          unit_cost: matched.costPrice,
          attributes: i.attributes || {},
        });
      }

      await admin.from('order_items').insert(preparedItems);

      if (totalCost > 0) {
        await admin
          .from('orders')
          .update({ total_cost: totalCost })
          .eq('id', order.id);
      }
    }

    // 5. If order was created with online payment already confirmed, credit Cashflow immediately
    let cashflowAdded = 0;
    if (isPaidEvent && totalAmount > 0) {
      const res = await recordOrderPaidCashflow(admin, {
        orgId: channel.org_id,
        orderId: order.id,
        orderNumber: order.order_number,
        paidAmount: totalAmount,
        channelName: channel.name,
        externalCode: body.order?.code,
      });
      cashflowAdded = res.amountAdded;
    }

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderNumber: order.order_number,
      paid: isPaidEvent,
      cashflowAdded,
    });
  } catch (err) {
    console.error('Order webhook error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
