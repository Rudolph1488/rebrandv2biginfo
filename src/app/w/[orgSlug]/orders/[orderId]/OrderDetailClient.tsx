'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type {
  CashflowRecord,
  OrderRecord,
  OrderStatus,
  Organization,
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
} from 'lucide-react';

interface ItemDraft {
  id?: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  attributes?: Record<string, string> | null;
}

export default function OrderDetailClient({
  org,
  initialOrder,
  initialItems,
  statuses,
  products,
  warehouses,
  initialPayments,
  canViewCost,
  canCashflow,
  canDelete,
}: {
  org: Organization;
  initialOrder: OrderRecord;
  initialItems: ItemDraft[];
  statuses: OrderStatus[];
  products: ProductRecord[];
  warehouses: Array<{ id: string; name: string; is_default: boolean }>;
  initialPayments: CashflowRecord[];
  canViewCost: boolean;
  canCashflow: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderRecord>(initialOrder);
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
  const [items, setItems] = useState<ItemDraft[]>(
    initialItems.length > 0
      ? initialItems
      : [{ product_id: null, name: '', qty: 1, unit_price: 0, unit_cost: 0 }]
  );
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

  function handleProductSelect(idx: number, prodId: string) {
    const prod = products.find((p) => p.id === prodId);
    const next = [...items];
    if (prod) {
      next[idx] = {
        ...next[idx],
        product_id: prod.id,
        name: prod.name,
        unit_price: Number(prod.sale_price) || 0,
        unit_cost: Number(prod.cost_price ?? 0) || 0,
      };
    } else {
      next[idx] = { ...next[idx], product_id: null };
    }
    setItems(next);
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
    if (validItems.length > 0) {
      await supabase.from('order_items').insert(
        validItems.map((i) => ({
          org_id: org.id,
          order_id: order.id,
          product_id: i.product_id || null,
          name: i.name.trim(),
          qty: Number(i.qty) || 1,
          unit_price: Number(i.unit_price) || 0,
          unit_cost: Number(i.unit_cost) || 0,
        }))
      );
    }

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
                    setItems([
                      ...items,
                      {
                        product_id: null,
                        name: '',
                        qty: 1,
                        unit_price: 0,
                        unit_cost: 0,
                      },
                    ])
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
                        const next = [...items];
                        next[idx] = { ...item, qty: Number(e.target.value) };
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
