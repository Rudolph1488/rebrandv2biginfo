'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type {
  OrderStatus,
  Organization,
  ProductRecord,
  StockMovementRecord,
  WarehouseRecord,
  WarehouseStockRecord,
} from '@/types/crm';
import {
  Warehouse,
  Boxes,
  ArrowLeftRight,
  Sliders,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

const WAREHOUSE_TYPE_LABELS: Record<string, string> = {
  main: 'Основний склад',
  production: 'Виробництво / Цех',
  retail: 'Магазин / Точка видачі',
  defect: 'Брак / Повернення',
};

const MOVEMENT_TYPE_META: Record<string, { label: string; color: string }> = {
  receipt: {
    label: 'Прибуткування',
    color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
  write_off: {
    label: 'Списання',
    color: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  },
  transfer: {
    label: 'Переміщення',
    color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  },
  order_deduction: {
    label: 'По замовленню',
    color: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  },
  adjustment: {
    label: 'Коригування',
    color: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
  },
};

export default function WarehousesClient({
  org,
  isAdmin,
  initialWarehouses,
  initialStock,
  initialMovements,
  products,
  statuses,
}: {
  org: Organization;
  isAdmin: boolean;
  initialWarehouses: WarehouseRecord[];
  initialStock: WarehouseStockRecord[];
  initialMovements: StockMovementRecord[];
  products: ProductRecord[];
  statuses: OrderStatus[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'stock' | 'movements' | 'rules'>('stock');
  const [warehouses, setWarehouses] =
    useState<WarehouseRecord[]>(initialWarehouses);
  const [stock, setStock] = useState<WarehouseStockRecord[]>(initialStock);
  const [movements, setMovements] =
    useState<StockMovementRecord[]>(initialMovements);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');

  const [movModalOpen, setMovModalOpen] = useState(false);
  const [movType, setMovType] = useState<'receipt' | 'write_off' | 'transfer'>(
    'receipt'
  );
  const [movWhId, setMovWhId] = useState(initialWarehouses[0]?.id || '');
  const [movTargetWhId, setMovTargetWhId] = useState('');
  const [movProductId, setMovProductId] = useState(products[0]?.id || '');
  const [movQty, setMovQty] = useState('1');
  const [movCost, setMovCost] = useState('0');
  const [movComment, setMovComment] = useState('');
  const [movError, setMovError] = useState<string | null>(null);
  const [movSaving, setMovSaving] = useState(false);

  const [whModalOpen, setWhModalOpen] = useState(false);
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whType, setWhType] = useState<
    'main' | 'production' | 'retail' | 'defect'
  >('main');
  const [whAddress, setWhAddress] = useState('');
  const [whAllowNeg, setWhAllowNeg] = useState(false);
  const [whAutoStatus, setWhAutoStatus] = useState('');
  const [whMinAlert, setWhMinAlert] = useState(true);
  const [whIsDefault, setWhIsDefault] = useState(false);
  const [whSaving, setWhSaving] = useState(false);

  const filteredStock =
    selectedWarehouseId === 'all'
      ? stock
      : stock.filter((s) => s.warehouse_id === selectedWarehouseId);

  function openNewWarehouse() {
    setEditingWhId(null);
    setWhName('');
    setWhCode('');
    setWhType('main');
    setWhAddress('');
    setWhAllowNeg(false);
    setWhAutoStatus('');
    setWhMinAlert(true);
    setWhIsDefault(warehouses.length === 0);
    setWhModalOpen(true);
  }

  function openEditWarehouse(w: WarehouseRecord) {
    setEditingWhId(w.id);
    setWhName(w.name);
    setWhCode(w.code || '');
    setWhType(w.type);
    setWhAddress(w.address || '');
    setWhAllowNeg(w.allow_negative_stock);
    setWhAutoStatus(w.auto_deduct_status_id || '');
    setWhMinAlert(w.min_stock_alert);
    setWhIsDefault(w.is_default);
    setWhModalOpen(true);
  }

  async function handleSaveWarehouse(e: React.FormEvent) {
    e.preventDefault();
    setWhSaving(true);
    const supabase = createClient();

    const payload = {
      org_id: org.id,
      name: whName.trim(),
      code: whCode.trim() || null,
      type: whType,
      address: whAddress.trim() || null,
      allow_negative_stock: whAllowNeg,
      auto_deduct_status_id: whAutoStatus || null,
      min_stock_alert: whMinAlert,
      is_default: whIsDefault,
      updated_at: new Date().toISOString(),
    };

    if (editingWhId) {
      const { data, error } = await supabase
        .from('warehouses')
        .update(payload)
        .eq('id', editingWhId)
        .select()
        .single();
      if (!error && data) {
        setWarehouses(
          warehouses.map((w) =>
            w.id === editingWhId ? (data as WarehouseRecord) : w
          )
        );
      }
    } else {
      const { data, error } = await supabase
        .from('warehouses')
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        setWarehouses([...warehouses, data as WarehouseRecord]);
        if (!movWhId) setMovWhId((data as WarehouseRecord).id);
      }
    }

    setWhSaving(false);
    setWhModalOpen(false);
    router.refresh();
  }

  async function handleCreateMovement(e: React.FormEvent) {
    e.preventDefault();
    setMovError(null);
    setMovSaving(true);

    const res = await fetch('/api/warehouses/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: org.id,
        type: movType,
        warehouseId: movWhId,
        targetWarehouseId: movTargetWhId || null,
        productId: movProductId,
        quantity: Number(movQty),
        unitCost: Number(movCost),
        comment: movComment,
      }),
    });

    const data = await res.json();
    setMovSaving(false);

    if (!res.ok) {
      setMovError(data.error || 'Помилка проведення документа');
      return;
    }

    setMovements([data.movement as StockMovementRecord, ...movements]);
    setMovModalOpen(false);
    setMovComment('');

    const supabase = createClient();
    const { data: freshStock } = await supabase
      .from('warehouse_stock')
      .select(
        '*, product:products(id, name, sku, unit), warehouse:warehouses(id, name)'
      )
      .eq('org_id', org.id);
    if (freshStock) {
      setStock(freshStock as unknown as WarehouseStockRecord[]);
    }
    router.refresh();
  }

  async function updateMinQty(stockId: string, val: string) {
    const num = Number(val) || 0;
    setStock((prev) =>
      prev.map((s) => (s.id === stockId ? { ...s, min_quantity: num } : s))
    );
    const supabase = createClient();
    await supabase
      .from('warehouse_stock')
      .update({ min_quantity: num })
      .eq('id', stockId);
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Складський облік
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Склади, залишки, документи руху та правила списання
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {warehouses.length > 0 && products.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMovError(null);
                setMovWhId(warehouses[0]?.id || '');
                setMovProductId(products[0]?.id || '');
                setMovModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Рух / Переміщення
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={openNewWarehouse}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" /> Новий склад
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setTab('stock')}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'stock'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Boxes className="h-3.5 w-3.5" /> Залишки ({filteredStock.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('movements')}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'movements'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" /> Документи руху (
          {movements.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('rules')}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'rules'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" /> Склади та правила (
          {warehouses.length})
        </button>
      </div>

      {/* TAB 1: STOCK */}
      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedWarehouseId('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedWarehouseId === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white/15'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0e1118] dark:text-slate-300'
              }`}
            >
              Усі склади
            </button>
            {warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWarehouseId(w.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedWarehouseId === w.id
                    ? 'bg-slate-900 text-white dark:bg-white/15'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0e1118] dark:text-slate-300'
                }`}
              >
                {w.name}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0e1118]">
            {filteredStock.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {warehouses.length === 0
                  ? 'Спочатку створіть склад у вкладці «Склади та правила».'
                  : 'На складах ще немає залишків. Проведіть «Прибуткування» товару.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3">Товар / Артикул</th>
                      <th className="px-5 py-3">Склад</th>
                      <th className="px-5 py-3 text-right">В наявності</th>
                      <th className="px-5 py-3 text-right">Резерв</th>
                      <th className="px-5 py-3 text-right">Мін. залишок</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                    {filteredStock.map((s) => {
                      const isLow =
                        Number(s.min_quantity) > 0 &&
                        Number(s.quantity) <= Number(s.min_quantity);
                      return (
                        <tr
                          key={s.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {s.product?.name || 'Товар'}
                            </p>
                            {s.product?.sku && (
                              <p className="font-mono text-xs text-slate-400">
                                {s.product.sku}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                            {s.warehouse?.name}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span
                              className={`inline-flex items-center gap-1 font-bold tabular-nums ${
                                isLow
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {isLow && <AlertTriangle className="h-3.5 w-3.5" />}
                              {Number(s.quantity)} {s.product?.unit || 'шт'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                            {Number(s.reserved_qty)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <input
                              type="number"
                              min="0"
                              value={s.min_quantity}
                              onChange={(e) => updateMinQty(s.id, e.target.value)}
                              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MOVEMENTS */}
      {tab === 'movements' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0e1118]">
          {movements.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Документів руху ще немає.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Док №</th>
                    <th className="px-5 py-3">Операція</th>
                    <th className="px-5 py-3">Товар</th>
                    <th className="px-5 py-3">Склад</th>
                    <th className="px-5 py-3 text-right">Кількість</th>
                    <th className="px-5 py-3">Коментар</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {movements.map((m) => {
                    const meta = MOVEMENT_TYPE_META[m.type] || {
                      label: m.type,
                      color: 'bg-slate-100 text-slate-700',
                    };
                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                          #{m.doc_number}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.color}`}
                          >
                            {m.type === 'receipt' && (
                              <ArrowDownLeft className="h-3 w-3" />
                            )}
                            {m.type === 'write_off' && (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                          {m.product?.name}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                          {m.warehouse?.name}
                          {m.target_warehouse?.name
                            ? ` → ${m.target_warehouse.name}`
                            : ''}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                          {Number(m.quantity)} {m.product?.unit || 'шт'}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                          {m.comment || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WAREHOUSES & RULES */}
      {tab === 'rules' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {warehouses.map((w) => {
            const autoStatus = statuses.find(
              (s) => s.id === w.auto_deduct_status_id
            );
            return (
              <div
                key={w.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0e1118]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                      <Warehouse className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          {w.name}
                        </h3>
                        {w.is_default && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400">
                            Основний
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {WAREHOUSE_TYPE_LABELS[w.type] || w.type}
                        {w.code ? ` • ${w.code}` : ''}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => openEditWarehouse(w)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                      Правила
                    </button>
                  )}
                </div>

                <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-white/10 dark:text-slate-400">
                  <p>
                    • Від&apos;ємні залишки:{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {w.allow_negative_stock ? 'Дозволено' : 'Заборонено'}
                    </strong>
                  </p>
                  <p>
                    • Автосписання по замовленню:{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {autoStatus ? `На етапі «${autoStatus.name}»` : 'Вимкнено'}
                    </strong>
                  </p>
                  <p>
                    • Контроль мін. залишків:{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {w.min_stock_alert ? 'Увімкнено' : 'Вимкнено'}
                    </strong>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: STOCK MOVEMENT */}
      {movModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Документ руху товару
              </h2>
              <button
                type="button"
                onClick={() => setMovModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {movError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                {movError}
              </div>
            )}

            <form onSubmit={handleCreateMovement} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Тип операції
                </label>
                <select
                  value={movType}
                  onChange={(e) =>
                    setMovType(
                      e.target.value as 'receipt' | 'write_off' | 'transfer'
                    )
                  }
                  className={inputCls}
                >
                  <option value="receipt">Прибуткування (на склад)</option>
                  <option value="write_off">Списання (зі складу)</option>
                  <option value="transfer">Переміщення між складами</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {movType === 'transfer' ? 'Зі складу' : 'Склад'}
                </label>
                <select
                  value={movWhId}
                  onChange={(e) => setMovWhId(e.target.value)}
                  className={inputCls}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              {movType === 'transfer' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    На склад (отримувач)
                  </label>
                  <select
                    required
                    value={movTargetWhId}
                    onChange={(e) => setMovTargetWhId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Оберіть склад —</option>
                    {warehouses
                      .filter((w) => w.id !== movWhId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Товар
                </label>
                <select
                  value={movProductId}
                  onChange={(e) => setMovProductId(e.target.value)}
                  className={inputCls}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Кількість
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={movQty}
                    onChange={(e) => setMovQty(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Ціна закупки (опц.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={movCost}
                    onChange={(e) => setMovCost(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Коментар / Підстава
                </label>
                <input
                  value={movComment}
                  onChange={(e) => setMovComment(e.target.value)}
                  placeholder="Напр.: Поставка від постачальника"
                  className={inputCls}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMovModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={movSaving}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: org.primary_color }}
                >
                  {movSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Провести
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: WAREHOUSE & RULES */}
      {whModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingWhId ? 'Налаштування складу' : 'Новий склад'}
              </h2>
              <button
                type="button"
                onClick={() => setWhModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Назва складу *
                  </label>
                  <input
                    required
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="Основний склад (Калуш)"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Тип складу
                  </label>
                  <select
                    value={whType}
                    onChange={(e) =>
                      setWhType(
                        e.target.value as
                          | 'main'
                          | 'production'
                          | 'retail'
                          | 'defect'
                      )
                    }
                    className={inputCls}
                  >
                    <option value="main">Основний склад</option>
                    <option value="production">Виробництво / Цех</option>
                    <option value="retail">Магазин / Точка видачі</option>
                    <option value="defect">Брак / Повернення</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Код (для 1С/артикулів)
                  </label>
                  <input
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                    placeholder="WH-01"
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Адреса
                  </label>
                  <input
                    value={whAddress}
                    onChange={(e) => setWhAddress(e.target.value)}
                    placeholder="м. Калуш..."
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Warehouse Rules */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Правила обліку на складі
                </p>

                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={whAllowNeg}
                    onChange={(e) => setWhAllowNeg(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Дозволити списання в мінус (від&apos;ємні залишки)
                </label>

                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={whMinAlert}
                    onChange={(e) => setWhMinAlert(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Контролювати мінімальний залишок (показувати в Дашборді)
                </label>

                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={whIsDefault}
                    onChange={(e) => setWhIsDefault(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Основний склад за замовчуванням
                </label>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Автоматичне списання при переході замовлення на етап:
                  </label>
                  <select
                    value={whAutoStatus}
                    onChange={(e) => setWhAutoStatus(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Вимкнено (тільки ручні документи)</option>
                    {statuses.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWhModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={whSaving}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: org.primary_color }}
                >
                  {whSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Зберегти склад
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
