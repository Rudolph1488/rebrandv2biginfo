'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type {
  BrandingMode,
  ProductCategoryRecord,
  ProductRecord,
  WarehouseStockRecord,
} from '@/types/crm';
import { Loader2, Trash2, TrendingUp, Warehouse, X } from 'lucide-react';

const MODE_SHORT: Record<BrandingMode, string> = {
  apparel: 'DTF / Вишивка',
  sublimation: 'Сублімація',
  none: 'Звичайний',
};

export function ProductDossierDrawer({
  product,
  categories,
  stockRows,
  categoriesMigrationMissing,
  canViewCost,
  canManage,
  currencySymbol,
  primaryColor,
  onClose,
  onSaved,
  onDeleted,
}: {
  product: ProductRecord;
  categories: ProductCategoryRecord[];
  stockRows: WarehouseStockRecord[];
  categoriesMigrationMissing: boolean;
  canViewCost: boolean;
  canManage: boolean;
  currencySymbol: string;
  primaryColor: string;
  onClose: () => void;
  onSaved: (updated: ProductRecord) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku || '');
  const [categoryId, setCategoryId] = useState(product.category_id || '');
  const [salePrice, setSalePrice] = useState(String(product.sale_price));
  const [costPrice, setCostPrice] = useState(String(product.cost_price ?? 0));
  const [unit, setUnit] = useState(product.unit || 'шт');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const totalStock = stockRows.reduce(
    (sum, s) => sum + (Number(s.quantity) || 0),
    0
  );

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(false);
    const supabase = createClient();

    const chosenCat = categoryId
      ? categories.find((c) => c.id === categoryId) || null
      : null;

    const payload: Record<string, unknown> = {
      name: name.trim(),
      sku: sku.trim() || null,
      category: chosenCat ? chosenCat.name : null,
      sale_price: Number(salePrice) || 0,
      unit: unit.trim() || 'шт',
      updated_at: new Date().toISOString(),
    };
    if (!categoriesMigrationMissing) {
      payload.category_id = chosenCat ? chosenCat.id : null;
    }
    if (canViewCost) {
      payload.cost_price = Number(costPrice) || 0;
    }

    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', product.id)
      .select()
      .single();

    setSaving(false);
    if (!error && data) {
      onSaved(data as ProductRecord);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    }
  }

  const sale = Number(salePrice) || 0;
  const cost = Number(costPrice) || 0;
  const margin = sale - cost;
  const pct = sale > 0 ? Math.round((margin / sale) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/10">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Досьє номенклатури
            </span>
            <h2 className="mt-0.5 text-xl font-bold text-slate-900 dark:text-white">
              {product.name}
            </h2>
            {product.sku && (
              <p className="mt-0.5 font-mono text-xs text-slate-400">
                SKU: {product.sku}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stock across warehouses */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Warehouse className="h-3.5 w-3.5" /> Залишки по складах
            </h3>
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-white">
              Всього: {totalStock} {product.unit}
            </span>
          </div>

          {stockRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-3.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              Поки немає записів залишків на складах (приход можна оформити в
              розділі «Склади»).
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-white/10 dark:border-white/10">
              {stockRows.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {st.warehouse?.name || 'Склад'}
                    </p>
                    {st.reserved_qty > 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        В резерві: {st.reserved_qty} {product.unit}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {st.quantity} {product.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Edit Form inside Dossier */}
        <form onSubmit={handleSave} className="mt-6 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" /> Параметри та собівартість
            </h3>
            {savedMsg && (
              <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                Збережено ✓
              </span>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Назва
            </label>
            <input
              required
              disabled={!canManage}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Артикул (SKU)
              </label>
              <input
                disabled={!canManage}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Папка (категорія)
              </label>
              <select
                disabled={!canManage || categoriesMigrationMissing}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputCls}
              >
                <option value="">Без папки</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({MODE_SHORT[c.branding_mode]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {canViewCost && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Собівартість ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!canManage}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Ціна продажу ({currencySymbol})
              </label>
              <input
                type="number"
                step="0.01"
                disabled={!canManage}
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Одиниця
              </label>
              <input
                disabled={!canManage}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {canViewCost && (
            <div className="flex items-center justify-between rounded-xl bg-slate-100/80 px-3.5 py-2.5 text-xs dark:bg-white/5">
              <span className="text-slate-600 dark:text-slate-300">
                Маржа з одиниці (без нанесення):
              </span>
              <span
                className={`font-mono font-bold ${
                  margin >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {margin >= 0 ? '+' : ''}
                {margin.toFixed(2)} {currencySymbol} ({pct}%)
              </span>
            </div>
          )}

          {canManage && (
            <div className="flex items-center justify-between gap-2 pt-3">
              <button
                type="button"
                onClick={() => onDeleted(product.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Видалити
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Зберегти зміни
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
