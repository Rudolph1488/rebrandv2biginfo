'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Organization, ProductRecord } from '@/types/crm';
import {
  PackagePlus,
  Plus,
  X,
  Loader2,
  Trash2,
  FileText,
  Warehouse,
} from 'lucide-react';

interface SupplyDocRow {
  id: string;
  doc_number: number;
  warehouse_id: string;
  supplier_name: string;
  invoice_number: string | null;
  total_amount: number;
  record_cashflow: boolean;
  comment: string | null;
  created_at: string;
  warehouse?: { id: string; name: string } | null;
}

export default function SuppliesClient({
  org,
  initialSupplies,
  warehouses,
  products,
}: {
  org: Organization;
  initialSupplies: SupplyDocRow[];
  warehouses: Array<{ id: string; name: string; is_default: boolean }>;
  products: ProductRecord[];
}) {
  const router = useRouter();
  const [supplies, setSupplies] = useState<SupplyDocRow[]>(initialSupplies);
  const [modalOpen, setModalOpen] = useState(false);

  const [whId, setWhId] = useState(
    warehouses.find((w) => w.is_default)?.id || warehouses[0]?.id || ''
  );
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [comment, setComment] = useState('');
  const [recordCash, setRecordCash] = useState(true);
  const [items, setItems] = useState<
    Array<{ productId: string; quantity: number; unitCost: number }>
  >([
    {
      productId: products[0]?.id || '',
      quantity: 1,
      unitCost: Number(products[0]?.cost_price ?? 0),
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const totalSpent = supplies.reduce(
    (sum, s) => sum + Number(s.total_amount || 0),
    0
  );

  const draftTotal = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0),
    0
  );

  async function handleCreateSupply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch('/api/warehouses/supply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: org.id,
        warehouseId: whId,
        supplierName: supplier,
        invoiceNumber: invoice,
        comment,
        recordCashflow: recordCash,
        items,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Помилка проведення прийомки');
      return;
    }

    setSupplies([data.supplyDoc as SupplyDocRow, ...supplies]);
    setModalOpen(false);
    setSupplier('');
    setInvoice('');
    setComment('');
    setItems([
      {
        productId: products[0]?.id || '',
        quantity: 1,
        unitCost: Number(products[0]?.cost_price ?? 0),
      },
    ]);
    router.refresh();
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Постачання та прийомки
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Оприбуткування товару від постачальників на склади
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 sm:w-auto"
          style={{ backgroundColor: org.primary_color }}
        >
          <PackagePlus className="h-4 w-4" />
          Нова прийомка
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Проведено прийомок
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {supplies.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Закуплено на суму
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {totalSpent.toLocaleString('uk-UA', { maximumFractionDigits: 2 })}{' '}
            {currencySymbol}
          </p>
        </div>
      </div>

      {/* Missing Prerequisites Notice */}
      {(warehouses.length === 0 || products.length === 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Щоб провести поставку, переконайтесь, що створено хоча б 1{' '}
          <Link href={`/w/${org.slug}/warehouses`} className="font-bold underline">
            Склад
          </Link>{' '}
          та 1 товар у{' '}
          <Link href={`/w/${org.slug}/products`} className="font-bold underline">
            Номенклатурі
          </Link>
          .
        </div>
      )}

      {/* MOBILE CARDS */}
      <div className="space-y-3 md:hidden">
        {supplies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-400">
            Документів постачання ще немає.
          </div>
        ) : (
          supplies.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-slate-400">
                  #{s.doc_number}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(s.created_at).toLocaleDateString('uk-UA')}
                </span>
              </div>
              <p className="mt-1.5 font-bold text-slate-900 dark:text-white">
                {s.supplier_name}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Warehouse className="h-3.5 w-3.5" /> {s.warehouse?.name}
                </span>
                <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                  {Number(s.total_amount).toFixed(2)} {currencySymbol}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0d1017] md:block">
        {supplies.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Документів постачання ще немає. Натисніть «Нова прийомка», щоб оприбуткувати партію товару.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Док №</th>
                  <th className="px-5 py-3.5">Постачальник</th>
                  <th className="px-5 py-3.5">Накладна</th>
                  <th className="px-5 py-3.5">Склад</th>
                  <th className="px-5 py-3.5 text-right">Сума</th>
                  <th className="px-5 py-3.5">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {supplies.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                      #{s.doc_number}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {s.supplier_name}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                      {s.invoice_number ? (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {s.invoice_number}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                      {s.warehouse?.name}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      {Number(s.total_amount).toFixed(2)} {currencySymbol}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {new Date(s.created_at).toLocaleDateString('uk-UA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BOTTOM-SHEET / MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Нова прийомка на склад
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateSupply} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Постачальник *
                  </label>
                  <input
                    required
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="ТОВ Текстиль"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Склад-отримувач *
                  </label>
                  <select
                    required
                    value={whId}
                    onChange={(e) => setWhId(e.target.value)}
                    className={inputCls}
                  >
                    {warehouses.length === 0 && (
                      <option value="">Немає складів</option>
                    )}
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Накладна №
                  </label>
                  <input
                    value={invoice}
                    onChange={(e) => setInvoice(e.target.value)}
                    placeholder="INV-204"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Позиції поставки
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setItems([
                        ...items,
                        {
                          productId: products[0]?.id || '',
                          quantity: 1,
                          unitCost: Number(products[0]?.cost_price ?? 0),
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <Plus className="h-3.5 w-3.5" /> Додати товар
                  </button>
                </div>

                <div className="space-y-2.5">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <select
                        value={it.productId}
                        onChange={(e) => {
                          const prod = products.find(
                            (p) => p.id === e.target.value
                          );
                          const next = [...items];
                          next[idx] = {
                            ...it,
                            productId: e.target.value,
                            unitCost: prod
                              ? Number(prod.cost_price ?? 0)
                              : it.unitCost,
                          };
                          setItems(next);
                        }}
                        className="col-span-12 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-[#131722] dark:text-white sm:col-span-6"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={it.quantity}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = {
                            ...it,
                            quantity: Number(e.target.value),
                          };
                          setItems(next);
                        }}
                        placeholder="К-ть"
                        className="col-span-5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-2"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitCost}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = {
                            ...it,
                            unitCost: Number(e.target.value),
                          };
                          setItems(next);
                        }}
                        placeholder="Ціна закуп."
                        className="col-span-5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white sm:col-span-3"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setItems(items.filter((_, i) => i !== idx))
                        }
                        className="col-span-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 sm:col-span-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t border-slate-200 pt-2.5 text-sm font-bold text-slate-800 dark:border-white/10 dark:text-white">
                  Сума прийомки: {draftTotal.toFixed(2)} {currencySymbol}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={recordCash}
                  onChange={(e) => setRecordCash(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Автоматично записати витрату в Касу
              </label>

              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Коментар до прийомки..."
                className={inputCls}
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={saving || warehouses.length === 0 || products.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: org.primary_color }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Провести прийомку
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
