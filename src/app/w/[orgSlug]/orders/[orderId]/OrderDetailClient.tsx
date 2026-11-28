'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compressMockupToWebp } from '@/lib/compressImage';
import { calculateDtfNesting } from '@/lib/dtfCalculator';
import { recordClientAuditLog } from '@/lib/clientAudit';
import type {
  BrandingMethod,
  BrandingMode,
  CashflowRecord,
  OrderItemBrandingRecord,
  OrderRecord,
  OrderStatus,
  Organization,
  PrintOptionRecord,
  PrintZoneRecord,
  ProductCategoryRecord,
  ProductRecord,
} from '@/types/crm';
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  User,
  Phone,
  Truck,
  Wallet,
  CheckCircle2,
  ExternalLink,
  Search,
  CalendarDays,
  ImagePlus,
  X,
} from 'lucide-react';

interface DtfZoneDraft {
  printZoneId: string | null;
  zone: string;
  widthCm: number;
  heightCm: number;
}

interface ItemDraft {
  id?: string;
  product_id: string | null;
  name: string;
  qty: number;
  base_price: number;
  base_cost: number;
  unit_price: number;
  unit_cost: number;
  brandingMode: BrandingMode;
  apparelMethod: 'dtf' | 'embroidery';
  dtfZones: DtfZoneDraft[];
  selectedOptionIds: string[];
  draftZoneId: string;
  draftZone: string;
  draftW: number | '';
  draftH: number | '';
  mockupUrl: string;
  attributes?: Record<string, string> | null;
}

function emptyDetailItem(firstZone?: PrintZoneRecord): ItemDraft {
  return {
    product_id: null,
    name: '',
    qty: 1,
    base_price: 0,
    base_cost: 0,
    unit_price: 0,
    unit_cost: 0,
    brandingMode: 'none',
    apparelMethod: 'dtf',
    dtfZones: [],
    selectedOptionIds: [],
    draftZoneId: firstZone?.id || '',
    draftZone: firstZone?.name || 'Серце',
    draftW: firstZone ? Number(firstZone.default_width_cm) : 10,
    draftH: firstZone ? Number(firstZone.default_height_cm) : 10,
    mockupUrl: '',
  };
}

export default function OrderDetailClient({
  org,
  initialOrder,
  initialItems,
  initialBrandings = [],
  statuses,
  products,
  productCategories = [],
  printOptions = [],
  printZones = [],
  warehouses,
  initialPayments,
  canViewCost,
  canCashflow,
  canDelete,
}: {
  org: Organization;
  initialOrder: OrderRecord;
  initialItems: Array<{
    id?: string;
    product_id: string | null;
    name: string;
    qty: number;
    unit_price: number;
    unit_cost: number;
    attributes?: Record<string, string> | null;
  }>;
  initialBrandings?: OrderItemBrandingRecord[];
  statuses: OrderStatus[];
  products: ProductRecord[];
  productCategories?: ProductCategoryRecord[];
  printOptions?: PrintOptionRecord[];
  printZones?: PrintZoneRecord[];
  warehouses: Array<{ id: string; name: string; is_default: boolean }>;
  initialPayments: CashflowRecord[];
  canViewCost: boolean;
  canCashflow: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderRecord>(initialOrder);
  const [brandings, setBrandings] =
    useState<OrderItemBrandingRecord[]>(initialBrandings);
  const [statusId, setStatusId] = useState(initialOrder.status_id || '');
  const [warehouseId, setWarehouseId] = useState(initialOrder.warehouse_id || '');
  const [ttn, setTtn] = useState(initialOrder.ttn || '');
  const [deliveryCity, setDeliveryCity] = useState(
    initialOrder.delivery_city || ''
  );
  const [deliveryWarehouse, setDeliveryWarehouse] = useState(
    initialOrder.delivery_warehouse || ''
  );
  const [notes, setNotes] = useState(initialOrder.notes || '');
  const [deadline, setDeadline] = useState(initialOrder.deadline || '');
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [uploadingMockupIdx, setUploadingMockupIdx] = useState<number | null>(
    null
  );

  const [items, setItems] = useState<ItemDraft[]>(() => {
    if (initialItems.length === 0) return [emptyDetailItem(printZones[0])];
    return initialItems.map((it) => {
      const itemBrandings = it.id
        ? initialBrandings.filter((b) => b.order_item_id === it.id)
        : [];
      const dtfZones: DtfZoneDraft[] = itemBrandings
        .filter((b) => b.method === 'dtf' && !b.print_option_id)
        .map((b) => ({
          printZoneId: b.print_zone_id,
          zone: b.zone_name,
          widthCm: Number(b.width_cm) || 10,
          heightCm: Number(b.height_cm) || 10,
        }));
      const selectedOptionIds = itemBrandings
        .map((b) => b.print_option_id)
        .filter((id): id is string => Boolean(id));

      const matchedProd = it.product_id
        ? products.find((p) => p.id === it.product_id)
        : undefined;
      const matchedCat = matchedProd?.category_id
        ? productCategories.find((c) => c.id === matchedProd.category_id)
        : undefined;

      let brandingMode: BrandingMode = matchedCat?.branding_mode || 'none';
      let apparelMethod: 'dtf' | 'embroidery' = 'dtf';

      if (itemBrandings.some((b) => b.method === 'sublimation')) {
        brandingMode = 'sublimation';
      } else if (itemBrandings.some((b) => b.method === 'embroidery')) {
        brandingMode = 'apparel';
        apparelMethod = 'embroidery';
      } else if (itemBrandings.some((b) => b.method === 'dtf')) {
        brandingMode = 'apparel';
        apparelMethod = 'dtf';
      }

      const brandingPriceSum = itemBrandings
        .filter((b) => b.method !== 'sublimation')
        .reduce((s, b) => s + (Number(b.unit_price) || 0), 0);
      const brandingCostSum = itemBrandings
        .filter((b) => b.method !== 'sublimation')
        .reduce((s, b) => s + (Number(b.unit_cost) || 0), 0);

      const basePrice = matchedProd
        ? Number(matchedProd.sale_price) || 0
        : Math.max(0, Number(it.unit_price) - brandingPriceSum);
      const baseCost = matchedProd
        ? Number(matchedProd.cost_price ?? 0) || 0
        : Math.max(0, Number(it.unit_cost) - brandingCostSum);

      return {
        ...emptyDetailItem(printZones[0]),
        id: it.id,
        product_id: it.product_id,
        name: it.name,
        qty: Number(it.qty) || 1,
        base_price: basePrice,
        base_cost: baseCost,
        unit_price: Number(it.unit_price) || 0,
        unit_cost: Number(it.unit_cost) || 0,
        brandingMode,
        apparelMethod,
        dtfZones,
        selectedOptionIds,
        mockupUrl: it.attributes?.['Макет'] || '',
        attributes: it.attributes,
      };
    });
  });
  const [payments, setPayments] = useState<CashflowRecord[]>(initialPayments);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [isEditingDelivery, setIsEditingDelivery] = useState(false);

  // Payment quick-add
  const [paying, setPaying] = useState(false);

  // NP quick search
  const [npSearching, setNpSearching] = useState(false);
  const [npCities, setNpCities] = useState<
    Array<{ Present: string; DeliveryCity: string }>
  >([]);
  const [npCityRef, setNpCityRef] = useState('');
  const [npWarehouses, setNpWarehouses] = useState<
    Array<{ Description: string; Ref: string }>
  >([]);
  const [npWhSearching, setNpWhSearching] = useState(false);
  const [npWarehouseRef, setNpWarehouseRef] = useState('');
  const [creatingTtn, setCreatingTtn] = useState(false);

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const totalAmount = items.reduce(
    (sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unit_price) || 0),
    0
  );
  const totalCost = items.reduce(
    (sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0),
    0
  );
  const totalPaid = payments
    .filter((p) => p.type === 'income')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const remaining = Math.max(0, totalAmount - totalPaid);

  function recalcDetailItem(
    item: ItemDraft,
    optionIds: string[] = item.selectedOptionIds,
    zones: DtfZoneDraft[] = item.dtfZones,
    qtyOverride?: number
  ): ItemDraft {
    const qty = Math.max(1, Number(qtyOverride ?? item.qty) || 1);
    const useDtf =
      item.brandingMode === 'apparel' && item.apparelMethod === 'dtf';
    const useOpts = item.brandingMode === 'apparel';

    const chosen = useOpts
      ? printOptions.filter((o) => optionIds.includes(o.id))
      : [];
    const optPrice = chosen.reduce((s, o) => s + (Number(o.price) || 0), 0);
    const optCost = chosen.reduce((s, o) => s + (Number(o.cost_price) || 0), 0);

    let dtfCost = 0;
    let dtfPrice = 0;
    if (useDtf) {
      for (const z of zones) {
        const calc = calculateDtfNesting({
          widthCm: z.widthCm,
          heightCm: z.heightCm,
          qty,
          settings: org.dtf_settings,
        });
        dtfCost += calc.costPerUnit;
        dtfPrice += calc.recommendedPricePerUnit;
      }
    }

    return {
      ...item,
      qty,
      selectedOptionIds: optionIds,
      dtfZones: zones,
      unit_price: Number((item.base_price + optPrice + dtfPrice).toFixed(2)),
      unit_cost: Number((item.base_cost + optCost + dtfCost).toFixed(2)),
    };
  }

  function handleProductSelect(idx: number, prodId: string) {
    const prod = products.find((p) => p.id === prodId);
    const next = [...items];
    const prev = next[idx];
    if (prod) {
      const cat = prod.category_id
        ? productCategories.find((c) => c.id === prod.category_id)
        : undefined;
      const mode: BrandingMode = cat?.branding_mode || 'none';
      const keepApparel = mode === 'apparel';
      next[idx] = recalcDetailItem(
        {
          ...prev,
          product_id: prod.id,
          name: prod.name,
          base_price: Number(prod.sale_price) || 0,
          base_cost: Number(prod.cost_price ?? 0) || 0,
          brandingMode: mode,
          apparelMethod: keepApparel ? prev.apparelMethod : 'dtf',
        },
        keepApparel ? prev.selectedOptionIds : [],
        keepApparel ? prev.dtfZones : []
      );
    } else {
      next[idx] = { ...prev, product_id: null };
    }
    setItems(next);
  }

  async function handleDetailMockupUpload(idx: number, file: File) {
    setUploadingMockupIdx(idx);
    try {
      const compressed = await compressMockupToWebp(file);
      const fd = new FormData();
      fd.append('orgId', org.id);
      fd.append('file', compressed);
      const res = await fetch('/api/orders/mockup', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        const next = [...items];
        next[idx] = { ...next[idx], mockupUrl: data.url };
        setItems(next);
      }
    } finally {
      setUploadingMockupIdx(null);
    }
  }

  async function handleStatusChange(newStatusId: string) {
    setErrorMsg(null);
    const prevStatus = statusId;
    setStatusId(newStatusId);

    const res = await fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, orderId: order.id, newStatusId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Помилка зміни етапу');
      setStatusId(prevStatus);
      return;
    }
    if (data.stockDeducted) {
      setOrder((o) => ({ ...o, stock_deducted: true }));
    }
    router.refresh();
  }

  async function handleSaveOrder(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(false);
    setErrorMsg(null);

    const supabase = createClient();

    const { error: updErr } = await supabase
      .from('orders')
      .update({
        warehouse_id: warehouseId || null,
        ttn: ttn.trim() || null,
        delivery_city: deliveryCity.trim() || null,
        delivery_warehouse: deliveryWarehouse.trim() || null,
        notes: notes.trim() || null,
        deadline: deadline || null,
        total_amount: totalAmount,
        total_cost: totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updErr) {
      setErrorMsg(updErr.message);
      setSaving(false);
      return;
    }

    await supabase.from('order_items').delete().eq('order_id', order.id);
    const validItems = items.filter((i) => i.name.trim());
    const nextBrandings: OrderItemBrandingRecord[] = [];
    if (validItems.length > 0) {
      const { data: insertedItems } = await supabase
        .from('order_items')
        .insert(
          validItems.map((i) => {
            const attrs: Record<string, string> = {
              ...(i.attributes || {}),
            };
            const method: BrandingMethod =
              i.brandingMode === 'apparel'
                ? i.apparelMethod
                : i.brandingMode === 'sublimation'
                  ? 'sublimation'
                  : 'none';
            if (method === 'dtf') attrs['Спосіб'] = 'DTF-друк';
            else if (method === 'embroidery') attrs['Спосіб'] = 'Вишивка';
            else if (method === 'sublimation') attrs['Спосіб'] = 'Сублімація';
            else delete attrs['Спосіб'];

            const chosenNames =
              i.brandingMode === 'apparel'
                ? printOptions
                    .filter((o) => i.selectedOptionIds.includes(o.id))
                    .map((o) => o.name)
                : [];
            const dtfNames =
              method === 'dtf'
                ? i.dtfZones.map((z) => `${z.zone} (${z.widthCm}×${z.heightCm} см)`)
                : [];
            const allPrint = [...dtfNames, ...chosenNames];
            if (allPrint.length > 0) attrs['Нанесення'] = allPrint.join(', ');
            else delete attrs['Нанесення'];

            if (i.mockupUrl.trim()) attrs['Макет'] = i.mockupUrl.trim();
            else delete attrs['Макет'];

            return {
              org_id: org.id,
              order_id: order.id,
              product_id: i.product_id || null,
              name: i.name.trim(),
              qty: Number(i.qty) || 1,
              unit_price: Number(i.unit_price) || 0,
              unit_cost: Number(i.unit_cost) || 0,
              attributes: attrs,
            };
          })
        )
        .select('id, attributes');

      if (insertedItems && insertedItems.length > 0) {
        setItems(
          validItems.map((it, idx) => ({
            ...it,
            id: insertedItems[idx]?.id ?? it.id,
            attributes:
              (insertedItems[idx]?.attributes as Record<string, string> | null) ??
              it.attributes,
          }))
        );
        const brandingRows: Array<Record<string, unknown>> = [];
        validItems.forEach((i, itemIdx) => {
          const orderItemId = insertedItems[itemIdx]?.id;
          if (!orderItemId) return;
          const qty = Math.max(1, Number(i.qty) || 1);

          if (i.brandingMode === 'apparel' && i.apparelMethod === 'dtf') {
            for (const z of i.dtfZones) {
              const calc = calculateDtfNesting({
                widthCm: z.widthCm,
                heightCm: z.heightCm,
                qty,
                settings: org.dtf_settings,
              });
              brandingRows.push({
                org_id: org.id,
                order_item_id: orderItemId,
                method: 'dtf',
                print_zone_id: z.printZoneId,
                print_option_id: null,
                zone_name: z.zone,
                width_cm: z.widthCm,
                height_cm: z.heightCm,
                roll_meters: calc.meters,
                film_cost_total: calc.filmCostTotal,
                press_cost_total: Number((calc.pressCostPerUnit * qty).toFixed(2)),
                unit_cost: calc.costPerUnit,
                unit_price: calc.recommendedPricePerUnit,
              });
            }
          }

          if (i.brandingMode === 'apparel') {
            for (const optId of i.selectedOptionIds) {
              const opt = printOptions.find((o) => o.id === optId);
              if (!opt) continue;
              brandingRows.push({
                org_id: org.id,
                order_item_id: orderItemId,
                method: i.apparelMethod === 'embroidery' ? 'embroidery' : 'dtf',
                print_zone_id: null,
                print_option_id: opt.id,
                zone_name: opt.name,
                unit_cost: Number(opt.cost_price) || 0,
                unit_price: Number(opt.price) || 0,
              });
            }
          }

          if (i.brandingMode === 'sublimation') {
            brandingRows.push({
              org_id: org.id,
              order_item_id: orderItemId,
              method: 'sublimation',
              print_zone_id: null,
              print_option_id: null,
              zone_name: 'Сублімація (макет)',
              unit_cost: i.base_cost,
              unit_price: i.base_price,
            });
          }
        });

        if (brandingRows.length > 0) {
          const { data: insertedBrandings } = await supabase
            .from('order_item_brandings')
            .insert(brandingRows)
            .select('*');
          if (insertedBrandings) {
            nextBrandings.push(
              ...(insertedBrandings as OrderItemBrandingRecord[])
            );
          }
        }
      }
    }

    setBrandings(nextBrandings);
    await recordClientAuditLog({
      orgId: org.id,
      action: 'order.updated',
      entityType: 'order',
      entityId: order.id,
      metadata: {
        order_number: order.order_number,
        total_amount: totalAmount,
        total_cost: totalCost,
      },
    });

    setSaving(false);
    setSavedMsg(true);
    setIsEditingItems(false);
    setIsEditingDelivery(false);
    setTimeout(() => setSavedMsg(false), 2500);
    router.refresh();
  }

  async function handleQuickDeadline(nextDate: string) {
    setDeadline(nextDate);
    setSavingDeadline(true);
    setErrorMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ deadline: nextDate || null })
      .eq('id', order.id);
    setSavingDeadline(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setOrder((prev) => ({ ...prev, deadline: nextDate || null }));
    router.refresh();
  }

  async function handleRecordPayment() {
    if (remaining <= 0) return;
    setPaying(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('cashflow_transactions')
      .insert({
        org_id: org.id,
        type: 'income',
        amount: remaining,
        category: 'Оплата замовлення',
        order_id: order.id,
        comment: `Оплата по замовленню #${order.order_number}`,
        occurred_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error && data) {
      await recordClientAuditLog({
        orgId: org.id,
        action: 'cashflow.income',
        entityType: 'cashflow_transaction',
        entityId: (data as CashflowRecord).id,
        metadata: {
          order_number: order.order_number,
          amount: remaining,
          category: 'Оплата замовлення',
        },
      });
      setPayments([data as CashflowRecord, ...payments]);
      router.refresh();
    }
    setPaying(false);
  }

  async function handleSearchNpCity() {
    if (!deliveryCity.trim()) return;
    setNpSearching(true);
    setErrorMsg(null);
    const res = await fetch('/api/integrations/novaposhta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: org.id,
        action: 'cities',
        cityName: deliveryCity.trim(),
      }),
    });
    const data = await res.json();
    setNpSearching(false);
    if (!res.ok) {
      setErrorMsg(data.error || 'Помилка запиту до Нової Пошти');
      return;
    }
    const addresses = data.data?.[0]?.Addresses || [];
    setNpCities(addresses);
  }

  async function handleSearchNpWarehouses(
    cityRef: string,
    searchString?: string
  ) {
    if (!cityRef) return;
    setNpWhSearching(true);
    setErrorMsg(null);
    const res = await fetch('/api/integrations/novaposhta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: org.id,
        action: 'warehouses',
        cityRef,
        searchString: searchString?.trim() || undefined,
      }),
    });
    const data = await res.json();
    setNpWhSearching(false);
    if (!res.ok) {
      setErrorMsg(data.error || 'Помилка завантаження відділень Нової Пошти');
      return;
    }
    setNpWarehouses(data.data || []);
  }

  async function handleCreateTtn() {
    if (!npCityRef || !npWarehouseRef) {
      setErrorMsg(
        'Спочатку оберіть місто та відділення через пошук Нової Пошти'
      );
      return;
    }
    if (!order.client?.phone) {
      setErrorMsg('У клієнта не вказаний телефон для створення ТТН');
      return;
    }
    setCreatingTtn(true);
    setErrorMsg(null);
    const res = await fetch('/api/integrations/novaposhta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: org.id,
        action: 'create_ttn',
        orderId: order.id,
        recipientCityRef: npCityRef,
        recipientWarehouseRef: npWarehouseRef,
        recipientPhone: order.client.phone,
        recipientName: order.client.contact_person || 'Отримувач',
        cost: String(totalAmount || 500),
        description:
          items
            .map((i) => i.name)
            .filter(Boolean)
            .join(', ')
            .slice(0, 100) || 'Товари',
      }),
    });
    const data = await res.json();
    setCreatingTtn(false);
    if (!res.ok) {
      setErrorMsg(data.error || 'Помилка створення ТТН');
      return;
    }
    setTtn(data.ttn);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
    router.refresh();
  }

  async function handleDeleteOrder() {
    if (!canDelete) return;
    if (!confirm(`Видалити замовлення #${order.order_number}?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('orders').delete().eq('id', order.id);
    if (!error) {
      router.push(`/w/${org.slug}/orders`);
      router.refresh();
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/w/${org.slug}/orders`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Назад до замовлень
      </Link>

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-[#0d1017] sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
              Замовлення #{order.order_number}
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {order.source_name}
            </span>
            {order.stock_deducted && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                Списано зі складу
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Створено {new Date(order.created_at).toLocaleString('uk-UA')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={statusId}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {statuses.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>

          {canDelete && (
            <button
              type="button"
              onClick={handleDeleteOrder}
              className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:hover:bg-red-500/10"
              title="Видалити замовлення"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT 2 COLS: ITEMS + DELIVERY */}
        <form onSubmit={handleSaveOrder} className="space-y-6 lg:col-span-2">
          {/* Items */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Позиції замовлення ({items.length})
              </h2>
              {!isEditingItems ? (
                <button
                  type="button"
                  onClick={() => setIsEditingItems(true)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Редагувати
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setItems([...items, emptyDetailItem(printZones[0])])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  <Plus className="h-3.5 w-3.5" /> Додати позицію
                </button>
              )}
            </div>

            {!isEditingItems ? (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between gap-1.5 py-3 text-sm sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {item.name || 'Товар'}
                      </p>
                      {item.attributes &&
                        Object.keys(item.attributes).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {Object.entries(item.attributes).map(([k, v]) => (
                              <span
                                key={k}
                                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
                              >
                                {k}: <strong className="text-slate-900 dark:text-white">{v}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      {(() => {
                        const itemBrandings = item.id
                          ? brandings.filter((b) => b.order_item_id === item.id)
                          : [];
                        if (itemBrandings.length === 0) return null;
                        return (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {itemBrandings.map((b) => (
                              <span
                                key={b.id}
                                className="inline-flex items-center gap-1 rounded-md border border-indigo-200/70 bg-indigo-50/60 px-2 py-0.5 text-[11px] font-medium text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                              >
                                <span className="uppercase text-[10px] opacity-75">
                                  {b.method}
                                </span>
                                <strong>{b.zone_name}</strong>
                                {b.width_cm && b.height_cm
                                  ? ` (${b.width_cm}×${b.height_cm}см)`
                                  : ''}
                                {b.roll_meters ? ` • ${b.roll_meters}м` : ''}
                                {canViewCost
                                  ? ` • собів. ${Number(b.unit_cost).toFixed(1)}${currencySymbol}/шт`
                                  : ''}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      <span>
                        {item.qty} × {Number(item.unit_price).toFixed(2)} {currencySymbol}
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {(Number(item.qty) * Number(item.unit_price)).toFixed(2)}{' '}
                        {currencySymbol}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0 dark:border-white/10"
                  >
                    <select
                      value={item.product_id || ''}
                      onChange={(e) => handleProductSelect(idx, e.target.value)}
                      className="col-span-12 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-[#131722] dark:text-white sm:col-span-4"
                    >
                      <option value="">Своя позиція...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <input
                      required
                      value={item.name}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...item, name: e.target.value };
                        setItems(next);
                      }}
                      placeholder="Назва"
                      className="col-span-12 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-3"
                    />

                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.qty}
                      onChange={(e) => {
                        const q = Math.max(1, Number(e.target.value) || 1);
                        const next = [...items];
                        next[idx] = recalcDetailItem(
                          item,
                          item.selectedOptionIds,
                          item.dtfZones,
                          q
                        );
                        setItems(next);
                      }}
                      className="col-span-5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-2"
                    />

                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = {
                          ...item,
                          unit_price: Number(e.target.value),
                        };
                        setItems(next);
                      }}
                      className="col-span-5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-2"
                    />

                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="col-span-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 sm:col-span-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    {/* Branding & Mockup Editor */}
                    <div className="col-span-12 space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'dtf', label: 'DTF-друк' },
                            { id: 'embroidery', label: 'Вишивка' },
                            { id: 'sublimation', label: 'Сублімація' },
                            { id: 'none', label: 'Без брендування' },
                          ] as const
                        ).map((m) => {
                          const active =
                            (item.brandingMode === 'apparel' &&
                              item.apparelMethod === m.id) ||
                            (item.brandingMode === 'sublimation' &&
                              m.id === 'sublimation') ||
                            (item.brandingMode === 'none' && m.id === 'none');
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                const next = [...items];
                                const updatedMode: BrandingMode =
                                  m.id === 'dtf' || m.id === 'embroidery'
                                    ? 'apparel'
                                    : m.id;
                                const updatedMethod =
                                  m.id === 'embroidery' ? 'embroidery' : 'dtf';
                                next[idx] = recalcDetailItem(
                                  {
                                    ...item,
                                    brandingMode: updatedMode,
                                    apparelMethod: updatedMethod,
                                  },
                                  updatedMode === 'apparel'
                                    ? item.selectedOptionIds
                                    : [],
                                  updatedMode === 'apparel'
                                    ? item.dtfZones
                                    : []
                                );
                                setItems(next);
                              }}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                active
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      {item.brandingMode === 'apparel' &&
                        item.apparelMethod === 'dtf' && (
                          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-indigo-200/70 bg-indigo-50/40 p-2 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                            {printZones.length > 0 ? (
                              <select
                                value={item.draftZoneId || printZones[0].id}
                                onChange={(e) => {
                                  const chosen = printZones.find(
                                    (z) => z.id === e.target.value
                                  );
                                  const next = [...items];
                                  next[idx] = {
                                    ...item,
                                    draftZoneId: chosen?.id || '',
                                    draftZone: chosen?.name || item.draftZone,
                                    draftW: chosen
                                      ? Number(chosen.default_width_cm)
                                      : item.draftW,
                                    draftH: chosen
                                      ? Number(chosen.default_height_cm)
                                      : item.draftH,
                                  };
                                  setItems(next);
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium dark:border-white/10 dark:bg-[#131722] dark:text-white"
                              >
                                {printZones.map((z) => (
                                  <option key={z.id} value={z.id}>
                                    {z.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={item.draftZone}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx] = {
                                    ...item,
                                    draftZone: e.target.value,
                                  };
                                  setItems(next);
                                }}
                                placeholder="Зона"
                                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-white/10 dark:bg-white/5 dark:text-white"
                              />
                            )}
                            <div className="flex items-center gap-1 text-[11px] text-slate-500">
                              <input
                                type="number"
                                min="1"
                                value={item.draftW}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const next = [...items];
                                  next[idx] = {
                                    ...item,
                                    draftW: raw === '' ? '' : Number(raw),
                                  };
                                  setItems(next);
                                }}
                                className="w-12 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center text-[11px] dark:border-white/10 dark:bg-white/5 dark:text-white"
                              />
                              <span>×</span>
                              <input
                                type="number"
                                min="1"
                                value={item.draftH}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const next = [...items];
                                  next[idx] = {
                                    ...item,
                                    draftH: raw === '' ? '' : Number(raw),
                                  };
                                  setItems(next);
                                }}
                                className="w-12 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center text-[11px] dark:border-white/10 dark:bg-white/5 dark:text-white"
                              />
                              <span>см</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const matched = item.draftZoneId
                                  ? printZones.find(
                                      (z) => z.id === item.draftZoneId
                                    )
                                  : printZones[0];
                                const zone: DtfZoneDraft = {
                                  printZoneId: matched?.id || null,
                                  zone: matched?.name || item.draftZone || 'Зона',
                                  widthCm: Math.max(1, Number(item.draftW) || 10),
                                  heightCm: Math.max(
                                    1,
                                    Number(item.draftH) || 10
                                  ),
                                };
                                const next = [...items];
                                next[idx] = recalcDetailItem(
                                  item,
                                  item.selectedOptionIds,
                                  [...item.dtfZones, zone]
                                );
                                setItems(next);
                              }}
                              className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
                            >
                              + Зона DTF
                            </button>

                            {item.dtfZones.map((z, zIdx) => (
                              <span
                                key={zIdx}
                                className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 shadow-2xs dark:bg-[#131722] dark:text-indigo-300"
                              >
                                {z.zone} ({z.widthCm}×{z.heightCm}см)
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...items];
                                    next[idx] = recalcDetailItem(
                                      item,
                                      item.selectedOptionIds,
                                      item.dtfZones.filter((_, i) => i !== zIdx)
                                    );
                                    setItems(next);
                                  }}
                                  className="text-slate-400 hover:text-red-500"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                      {item.brandingMode === 'apparel' &&
                        printOptions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {printOptions.map((opt) => {
                              const active = item.selectedOptionIds.includes(
                                opt.id
                              );
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    const nextIds = active
                                      ? item.selectedOptionIds.filter(
                                          (id) => id !== opt.id
                                        )
                                      : [...item.selectedOptionIds, opt.id];
                                    const next = [...items];
                                    next[idx] = recalcDetailItem(item, nextIds);
                                    setItems(next);
                                  }}
                                  className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                    active
                                      ? 'border-indigo-600 bg-indigo-600 text-white'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                                  }`}
                                >
                                  {opt.name} (+{Number(opt.price).toFixed(0)}
                                  {currencySymbol})
                                </button>
                              );
                            })}
                          </div>
                        )}

                      <div className="grid grid-cols-12 gap-1.5">
                        <input
                          value={item.mockupUrl}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...item, mockupUrl: e.target.value };
                            setItems(next);
                          }}
                          placeholder="Лінк на макет або завантажте прев'ю →"
                          className="col-span-8 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-9"
                        />
                        <label className="col-span-4 inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 px-2 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 sm:col-span-3">
                          {uploadingMockupIdx === idx ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ImagePlus className="h-3.5 w-3.5" />
                          )}
                          <span>{item.mockupUrl ? 'Оновити' : 'Макет'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleDetailMockupUpload(idx, f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
              <span className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
                Разом: {totalAmount.toFixed(2)} {currencySymbol}
              </span>
              {canViewCost && (
                <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  Маржа: {(totalAmount - totalCost).toFixed(2)} {currencySymbol}
                </span>
              )}
            </div>
          </div>

          {/* Delivery & Warehouse */}
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Truck className="h-4 w-4 text-slate-400" />
                Доставка, Склад і Нотатки
              </h2>
              {!isEditingDelivery && (
                <button
                  type="button"
                  onClick={() => setIsEditingDelivery(true)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Редагувати
                </button>
              )}
            </div>

            {!isEditingDelivery ? (
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-white/10">
                  <span className="text-xs text-slate-500">Склад:</span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {warehouses.find((w) => w.id === warehouseId)?.name || 'Не вказано'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-white/10">
                  <span className="text-xs text-slate-500">ТТН Нової Пошти:</span>
                  <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {ttn || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
                  <span className="shrink-0 text-xs text-slate-500">Адреса доставки:</span>
                  <span className="text-right text-xs font-medium text-slate-800 dark:text-slate-200">
                    {deliveryCity || deliveryWarehouse
                      ? `${deliveryCity}${deliveryWarehouse ? `, ${deliveryWarehouse}` : ''}`
                      : 'Не вказано'}
                  </span>
                </div>
                {notes && (
                  <div className="pt-1">
                    <p className="text-xs text-slate-500">Нотатки:</p>
                    <p className="mt-1 whitespace-pre-line text-xs text-slate-700 dark:text-slate-300">
                      {notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Склад відвантаження
                </label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Без складу —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  ТТН Нової Пошти
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={ttn}
                    onChange={(e) => setTtn(e.target.value)}
                    placeholder="20450000000000"
                    className={`${inputCls} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={handleCreateTtn}
                    disabled={
                      creatingTtn ||
                      !npCityRef ||
                      !npWarehouseRef ||
                      !order.client?.phone
                    }
                    title={
                      !npCityRef || !npWarehouseRef
                        ? 'Оберіть місто та відділення через пошук Нової Пошти'
                        : !order.client?.phone
                          ? 'У клієнта не вказаний телефон'
                          : 'Згенерувати ТТН в кабінеті Нової Пошти'
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    {creatingTtn && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Створити ТТН
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Місто (Нова Пошта)
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={deliveryCity}
                    onChange={(e) => {
                      setDeliveryCity(e.target.value);
                      setNpCityRef('');
                      setNpWarehouseRef('');
                      setNpWarehouses([]);
                    }}
                    placeholder="Київ"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={handleSearchNpCity}
                    disabled={npSearching}
                    title="Знайти місто в базі Нової Пошти"
                    className="rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    {npSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {npCities.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-xs dark:border-white/10 dark:bg-[#131722]">
                    {npCities.map((c) => (
                      <button
                        key={c.DeliveryCity}
                        type="button"
                        onClick={() => {
                          setDeliveryCity(c.Present);
                          setNpCityRef(c.DeliveryCity);
                          setNpWarehouseRef('');
                          setNpWarehouses([]);
                          setNpCities([]);
                          handleSearchNpWarehouses(c.DeliveryCity);
                        }}
                        className="block w-full rounded-lg px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                      >
                        {c.Present}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Відділення / Поштомат
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={deliveryWarehouse}
                    onChange={(e) => {
                      setDeliveryWarehouse(e.target.value);
                      setNpWarehouseRef('');
                    }}
                    placeholder="Відділення №5"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleSearchNpWarehouses(npCityRef, deliveryWarehouse)
                    }
                    disabled={!npCityRef || npWhSearching}
                    title={
                      npCityRef
                        ? 'Знайти відділення в обраному місті'
                        : 'Спочатку знайдіть і оберіть місто'
                    }
                    className="rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    {npWhSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {npWarehouses.length > 0 && (
                  <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-xs dark:border-white/10 dark:bg-[#131722]">
                    {npWarehouses.map((w) => (
                      <button
                        key={w.Ref}
                        type="button"
                        onClick={() => {
                          setDeliveryWarehouse(w.Description);
                          setNpWarehouseRef(w.Ref);
                          setNpWarehouses([]);
                        }}
                        className="block w-full rounded-lg px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                      >
                        {w.Description}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Деталі / Нотатки
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: org.primary_color }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Зберегти зміни
              </button>
              <button
                type="button"
                onClick={() => setIsEditingDelivery(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:text-slate-300"
              >
                Скасувати
              </button>
            </div>
              </>
            )}

            {!isEditingDelivery && (isEditingItems || savedMsg) && (
              <div className="flex items-center gap-3 pt-1">
                {isEditingItems && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: org.primary_color }}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Зберегти позиції
                  </button>
                )}
                {savedMsg && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ Замовлення оновлено
                  </span>
                )}
              </div>
            )}
          </div>
        </form>

        {/* RIGHT COL: DEADLINE + CLIENT + CASHFLOW */}
        <div className="space-y-6">
          {/* Deadline Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <CalendarDays className="h-4 w-4 text-indigo-500" />
                Дедлайн відвантаження
              </h2>
              {savingDeadline && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="date"
                value={deadline}
                disabled={savingDeadline}
                onChange={(e) => handleQuickDeadline(e.target.value)}
                className={inputCls}
              />
              {deadline && (
                <button
                  type="button"
                  disabled={savingDeadline}
                  onClick={() => handleQuickDeadline('')}
                  title="Прибрати дедлайн"
                  className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                >
                  Очистити
                </button>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                { label: 'Сьогодні', days: 0 },
                { label: 'Завтра', days: 1 },
                { label: '+3 дні', days: 3 },
              ].map((preset) => {
                const d = new Date();
                d.setDate(d.getDate() + preset.days);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const active = deadline === key;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={savingDeadline}
                    onClick={() => handleQuickDeadline(key)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Link
                href={`/w/${org.slug}/calendar`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Відкрити Календар →
              </Link>
              {deadline && (
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    order.production_status === 'done'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : order.production_status === 'in_progress'
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                  }`}
                >
                  {order.production_status === 'done'
                    ? 'Вироблено ✓'
                    : order.production_status === 'in_progress'
                      ? 'У виробництві'
                      : 'Заявка на виробництво'}
                  {(order.production_elapsed_seconds || 0) > 0 && (() => {
                    const sec = Number(order.production_elapsed_seconds) || 0;
                    const h = Math.floor(sec / 3600);
                    const m = Math.floor((sec % 3600) / 60);
                    return ` (${h > 0 ? `${h}г ` : ''}${m}хв)`;
                  })()}
                </span>
              )}
            </div>
          </div>

          {/* Client Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Клієнт
            </h2>
            {order.client ? (
              <div className="mt-3 space-y-2.5 text-sm">
                <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <User className="h-4 w-4 text-slate-400" />
                  {order.client.contact_person}
                </p>
                {order.client.phone && (
                  <a
                    href={`tel:${order.client.phone}`}
                    className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <Phone className="h-3.5 w-3.5" /> {order.client.phone}
                  </a>
                )}
                <Link
                  href={`/w/${org.slug}/clients/${order.client.id}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  Відкрити Досьє <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Клієнт не прив&apos;язаний.</p>
            )}
          </div>

          {/* 1-Click Payment to Cashflow */}
          {canCashflow && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Wallet className="h-4 w-4 text-emerald-500" />
                Оплата в Касу
              </h2>

              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Сума замовлення:</span>
                  <span className="font-semibold tabular-nums">
                    {totalAmount.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Сплачено:</span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {totalPaid.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-white/10">
                  <span className="font-semibold">Залишок:</span>
                  <span className="font-bold tabular-nums">
                    {remaining.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>

              {remaining > 0 ? (
                <button
                  type="button"
                  disabled={paying}
                  onClick={handleRecordPayment}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {paying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Прийняти {remaining.toFixed(0)} {currencySymbol} в Касу
                </button>
              ) : (
                <div className="mt-4 rounded-xl bg-emerald-50 py-2 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                  ✓ Повністю оплачено
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
