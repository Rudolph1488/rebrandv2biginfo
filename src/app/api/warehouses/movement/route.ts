import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      orgId,
      type,
      warehouseId,
      targetWarehouseId,
      productId,
      quantity,
      unitCost,
      comment,
    } = (await request.json()) as {
      orgId: string;
      type: 'receipt' | 'write_off' | 'transfer' | 'adjustment';
      warehouseId: string;
      targetWarehouseId?: string | null;
      productId: string;
      quantity: number;
      unitCost?: number;
      comment?: string;
    };

    const membership = ctx.memberships.find((m) => m.org_id === orgId);
    const hasAccess =
      ctx.profile?.is_super_admin ||
      membership?.role === 'owner' ||
      membership?.role === 'admin' ||
      Boolean(membership?.permissions?.warehouses);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const qty = Number(quantity);
    if (!warehouseId || !productId || !qty || qty <= 0) {
      return NextResponse.json(
        { error: 'Вкажіть склад, товар та коректну кількість (> 0)' },
        { status: 400 }
      );
    }

    if (type === 'transfer' && (!targetWarehouseId || targetWarehouseId === warehouseId)) {
      return NextResponse.json(
        { error: 'Оберіть інший склад-отримувач для переміщення' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Check warehouse rules
    const { data: warehouse, error: whErr } = await admin
      .from('warehouses')
      .select('id, allow_negative_stock')
      .eq('id', warehouseId)
      .eq('org_id', orgId)
      .single();

    if (whErr || !warehouse) {
      return NextResponse.json({ error: 'Склад не знайдено' }, { status: 404 });
    }

    // 2. Get current stock on source warehouse
    const { data: existingStock } = await admin
      .from('warehouse_stock')
      .select('id, quantity')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', productId)
      .maybeSingle();

    const currentQty = Number(existingStock?.quantity ?? 0);

    if (
      (type === 'write_off' || type === 'transfer') &&
      !warehouse.allow_negative_stock &&
      currentQty < qty
    ) {
      return NextResponse.json(
        {
          error: `Недостатньо товару на складі (доступно: ${currentQty}). За правилами цього складу від'ємні залишки заборонені.`,
        },
        { status: 400 }
      );
    }

    // 3. Calculate new quantity on source warehouse
    let nextQty = currentQty;
    if (type === 'receipt') nextQty = currentQty + qty;
    else if (type === 'write_off' || type === 'transfer') nextQty = currentQty - qty;
    else if (type === 'adjustment') nextQty = qty;

    await admin.from('warehouse_stock').upsert(
      {
        org_id: orgId,
        warehouse_id: warehouseId,
        product_id: productId,
        quantity: nextQty,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'warehouse_id,product_id' }
    );

    // 4. If transfer, increment target warehouse
    if (type === 'transfer' && targetWarehouseId) {
      const { data: targetStock } = await admin
        .from('warehouse_stock')
        .select('quantity')
        .eq('warehouse_id', targetWarehouseId)
        .eq('product_id', productId)
        .maybeSingle();

      const targetQty = Number(targetStock?.quantity ?? 0) + qty;
      await admin.from('warehouse_stock').upsert(
        {
          org_id: orgId,
          warehouse_id: targetWarehouseId,
          product_id: productId,
          quantity: targetQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'warehouse_id,product_id' }
      );
    }

    // 5. Log movement document
    const { data: movement, error: movErr } = await admin
      .from('stock_movements')
      .insert({
        org_id: orgId,
        type,
        warehouse_id: warehouseId,
        target_warehouse_id: type === 'transfer' ? targetWarehouseId : null,
        product_id: productId,
        quantity: qty,
        unit_cost: Number(unitCost) || 0,
        comment: comment?.trim() || null,
        created_by: ctx.user.id,
      })
      .select(
        '*, product:products(name, unit), warehouse:warehouses!stock_movements_warehouse_id_fkey(name), target_warehouse:warehouses!stock_movements_target_warehouse_id_fkey(name)'
      )
      .single();

    if (movErr) {
      return NextResponse.json({ error: movErr.message }, { status: 500 });
    }

    await recordAuditLog({
      orgId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      action: `warehouse.${type}`,
      entityType: 'stock_movement',
      entityId: movement?.id ?? null,
      metadata: {
        warehouse_id: warehouseId,
        target_warehouse_id: targetWarehouseId || null,
        product_id: productId,
        quantity: qty,
      },
    });

    return NextResponse.json({ ok: true, movement });
  } catch (err) {
    console.error('Stock movement error:', err);
    return NextResponse.json(
      { error: 'Внутрішня помилка сервера' },
      { status: 500 }
    );
  }
}
