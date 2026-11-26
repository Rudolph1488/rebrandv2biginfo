'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Organization, ProductRecord } from '@/types/crm';
import { Plus, Search, Edit3, Trash2, X, Loader2 } from 'lucide-react';

export default function ProductsClient({
  org,
  initialProducts,
  canViewCost,
  canManage,
}: {
  org: Organization;
  initialProducts: ProductRecord[];
  canViewCost: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRecord[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [salePrice, setSalePrice] = useState('0');
  const [costPrice, setCostPrice] = useState('0');
  const [unit, setUnit] = useState('шт');

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const filtered = products.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setEditingId(null);
    setName('');
    setSku('');
    setCategory('');
    setSalePrice('0');
    setCostPrice('0');
    setUnit('шт');
    setModalOpen(true);
  }

  function openEdit(p: ProductRecord) {
    setEditingId(p.id);
    setName(p.name);
    setSku(p.sku || '');
    setCategory(p.category || '');
    setSalePrice(String(p.sale_price));
    setCostPrice(String(p.cost_price ?? 0));
    setUnit(p.unit || 'шт');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      org_id: org.id,
      name: name.trim(),
      sku: sku.trim() || null,
      category: category.trim() || null,
      sale_price: Number(salePrice) || 0,
      unit: unit.trim() || 'шт',
      updated_at: new Date().toISOString(),
    };

    if (canViewCost) {
      payload.cost_price = Number(costPrice) || 0;
    }

    if (editingId) {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single();
      if (!error && data) {
        setProducts(
          products.map((p) =>
            p.id === editingId ? (data as ProductRecord) : p
          )
        );
      }
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        setProducts([data as ProductRecord, ...products]);
      }
    }

    setSaving(false);
    setModalOpen(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) {
      setProducts(products.filter((p) => p.id !== id));
      router.refresh();
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Номенклатура
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Товари та послуги компанії ({products.length})
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: org.primary_color }}
          >
            <Plus className="h-4 w-4" /> Додати позицію
          </button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за назвою, артикулом чи категорією..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-[#0d1017] dark:text-white"
        />
      </div>

      {/* MOBILE CARDS */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-400">
            Позицій поки немає.
          </div>
        ) : (
          filtered.map((p) => {
            const margin =
              canViewCost && p.cost_price !== undefined
                ? Number(p.sale_price) - Number(p.cost_price)
                : 0;
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {p.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {p.sku ? `${p.sku} • ` : ''}
                      {p.category || 'Без категорії'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="rounded-lg p-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm dark:border-white/10">
                  <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                    {Number(p.sale_price).toFixed(2)} {currencySymbol} / {p.unit}
                  </span>
                  {canViewCost && (
                    <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      Маржа: +{margin.toFixed(0)} {currencySymbol}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0d1017] md:block">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Позицій поки немає. Додайте перший товар або послугу.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Назва / Артикул</th>
                  <th className="px-5 py-3.5">Категорія</th>
                  <th className="px-5 py-3.5">Ціна продажу</th>
                  {canViewCost && <th className="px-5 py-3.5">Собівартість</th>}
                  {canViewCost && <th className="px-5 py-3.5">Маржа</th>}
                  <th className="px-5 py-3.5 text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {filtered.map((p) => {
                  const margin =
                    canViewCost && p.cost_price !== undefined
                      ? Number(p.sale_price) - Number(p.cost_price)
                      : 0;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </p>
                        {p.sku && (
                          <p className="font-mono text-xs text-slate-400">
                            {p.sku}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                        {p.category || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                        {Number(p.sale_price).toFixed(2)} {currencySymbol} /{' '}
                        {p.unit}
                      </td>
                      {canViewCost && (
                        <td className="px-5 py-3.5 tabular-nums text-slate-600 dark:text-slate-400">
                          {Number(p.cost_price ?? 0).toFixed(2)}{' '}
                          {currencySymbol}
                        </td>
                      )}
                      {canViewCost && (
                        <td className="px-5 py-3.5 font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                          +{margin.toFixed(2)} {currencySymbol}
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingId ? 'Редагувати позицію' : 'Нова позиція'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Назва *
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Худі оверсайз з принтом"
                  className={inputCls}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Артикул (SKU)
                  </label>
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="HD-001"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Категорія
                  </label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Одяг"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Ціна ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {canViewCost && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Собівартість
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Од. виміру
                  </label>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: org.primary_color }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Зберегти
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
