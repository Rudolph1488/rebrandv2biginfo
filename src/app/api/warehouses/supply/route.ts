import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';

interface SupplyItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      orgId,
      warehouseId,
      supplierName,
      invoiceNumber,
      comment,
      recordCashflow,
      items,
    } = (await request.json()) as {
      orgId: string;
      warehouseId: string;
      supplierName: string;
      invoiceNumber?: string;
      comment?: string;
      recordCashflow?: boolean;
      items: SupplyItemInput[];
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

    const validItems = (items || []).filter(
      (i) => i.productId && Number(i.quantity) > 0
    );

    if (!warehouseId || !supplierName?.trim() || validItems.length === 0) {
      return NextResponse.json(
        { error: 'Оберіть склад, вкажіть постачальника та додайте хоча б 1 товар' },
        { status: 400 }
      );
    }

    const totalAmount = validItems.reduce(
      (sum, i) => sum + Number(i.quantity) * (Number(i.unitCost) || 0),
      0
    );

    const admin = createAdminClient();

    // 1. Create supply document
    const { data: supplyDoc, error: docErr } = await admin
      .from('supply_documents')
      .insert({
        org_id: orgId,
        warehouse_id: warehouseId,
        supplier_name: supplierName.trim(),
        invoice_number: invoiceNumber?.trim() || null,
        total_amount: totalAmount,
        record_cashflow: Boolean(recordCashflow),
        comment: comment?.trim() || null,
        created_by: ctx.user.id,
      })
      .select('*, warehouse:warehouses(name)')
      .single();

    if (docErr || !supplyDoc) {
      return NextResponse.json(
        { error: docErr?.message || 'Помилка створення документа постачання' },
        { status: 500 }
      );
    }

    // 2. Process each item: increment stock + log movement
    for (const item of validItems) {
      const qty = Number(item.quantity);
      const cost = Number(item.unitCost) || 0;

      const { data: existingStock } = await admin
        .from('warehouse_stock')
        .select('quantity')
        .eq('warehouse_id', warehouseId)
        .eq('product_id', item.productId)
        .maybeSingle();

      const nextQty = Number(existingStock?.quantity ?? 0) + qty;

      await admin.from('warehouse_stock').upsert(
        {
          org_id: orgId,
          warehouse_id: warehouseId,
          product_id: item.productId,
          quantity: nextQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'warehouse_id,product_id' }
      );

      await admin.from('stock_movements').insert({
        org_id: orgId,
        type: 'receipt',
        warehouse_id: warehouseId,
        product_id: item.productId,
        quantity: qty,
        unit_cost: cost,
        comment: `Прийомка #${supplyDoc.doc_number} (${supplierName.trim()})`,
        created_by: ctx.user.id,
      });
    }

    // 3. Optional cashflow expense
    if (recordCashflow && totalAmount > 0) {
      await admin.from('cashflow_transactions').insert({
        org_id: orgId,
        type: 'expense',
        amount: totalAmount,
        category: 'Постачання товару',
        comment: `Прийомка #${supplyDoc.doc_number} від ${supplierName.trim()}`,
        occurred_at: new Date().toISOString(),
        created_by: ctx.user.id,
      });
    }

    await recordAuditLog({
      orgId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      action: 'warehouse.supply',
      entityType: 'supply_document',
      entityId: supplyDoc.id,
      metadata: {
        doc_number: supplyDoc.doc_number,
        supplier_name: supplierName.trim(),
        total_amount: totalAmount,
        items_count: validItems.length,
        record_cashflow: Boolean(recordCashflow),
      },
    });

    return NextResponse.json({ ok: true, supplyDoc });
  } catch (err) {
    console.error('Supply error:', err);
    return NextResponse.json(
      { error: 'Внутрішня помилка сервера' },
      { status: 500 }
    );
  }
}
