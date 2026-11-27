'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_DTF_SETTINGS,
  type DtfRollSettings,
} from '@/lib/dtfCalculator';
import { CategoryModal } from '@/components/products/CategoryModal';
import { ProductDossierDrawer } from '@/components/products/ProductDossierDrawer';
import type {
  BrandingMode,
  Organization,
  PrintOptionRecord,
  PrintZoneRecord,
  ProductCategoryRecord,
  ProductRecord,
  WarehouseStockRecord,
} from '@/types/crm';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  Loader2,
  Layers,
  Package,
  Folder,
  FolderPlus,
  Warehouse,
} from 'lucide-react';

const DEFAULT_PRINT_PRESETS = [
  { name: 'Вишивка лого (серце)', price: 180, cost_price: 60 },
  { name: 'Вишивка спина', price: 320, cost_price: 110 },
  { name: 'Вишивка рукав', price: 150, cost_price: 50 },
];

const DEFAULT_ZONE_PRESETS = [
  { name: 'Серце', default_width_cm: 10, default_height_cm: 10 },
  { name: 'Груди', default_width_cm: 26, default_height_cm: 10 },
  { name: 'Спина А4', default_width_cm: 21, default_height_cm: 29 },
  { name: 'Спина А3', default_width_cm: 29, default_height_cm: 40 },
  { name: 'Плече / Рукав', default_width_cm: 10, default_height_cm: 10 },
  { name: 'Капюшон', default_width_cm: 12, default_height_cm: 12 },
];

const DEFAULT_CATEGORY_PRESETS: Array<{
  name: string;
  branding_mode: BrandingMode;
}> = [
  { name: 'Одяг', branding_mode: 'apparel' },
  { name: 'Чашки', branding_mode: 'sublimation' },
  { name: 'Бейджі', branding_mode: 'sublimation' },
];

const BRANDING_MODE_META: Record<
  BrandingMode,
  { short: string; badgeCls: string }
> = {
  apparel: {
    short: 'DTF / Вишивка',
    badgeCls:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
  },
  sublimation: {
    short: 'Сублімація',
    badgeCls:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  },
  none: {
    short: 'Звичайний',
    badgeCls:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10',
  },
};

export default function ProductsClient({
  org,
  initialProducts,
  initialCategories = [],
  initialStock = [],
  initialPrintOptions = [],
  initialPrintZones = [],
  printOptionsMigrationMissing = false,
  categoriesMigrationMissing = false,
  printZonesMigrationMissing = false,
  canViewCost,
  canManage,
}: {
  org: Organization;
  initialProducts: ProductRecord[];
  initialCategories?: ProductCategoryRecord[];
  initialStock?: WarehouseStockRecord[];
  initialPrintOptions?: PrintOptionRecord[];
  initialPrintZones?: PrintZoneRecord[];
  printOptionsMigrationMissing?: boolean;
  categoriesMigrationMissing?: boolean;
  printZonesMigrationMissing?: boolean;
  canViewCost: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'products' | 'options'>('products');
  const [products, setProducts] = useState<ProductRecord[]>(initialProducts);
  const [categories, setCategories] =
    useState<ProductCategoryRecord[]>(initialCategories);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');

  const [printZones, setPrintZones] =
    useState<PrintZoneRecord[]>(initialPrintZones);
  const [zoneName, setZoneName] = useState('');
  const [zoneW, setZoneW] = useState('10');
  const [zoneH, setZoneH] = useState('10');
  const [savingZone, setSavingZone] = useState(false);

  const [printOptions, setPrintOptions] =
    useState<PrintOptionRecord[]>(initialPrintOptions);
  const [optName, setOptName] = useState('');
  const [optPrice, setOptPrice] = useState('150');
  const [optCost, setOptCost] = useState('50');
  const [savingOpt, setSavingOpt] = useState(false);

  const [dtfSettings, setDtfSettings] = useState<DtfRollSettings>({
    ...DEFAULT_DTF_SETTINGS,
    ...(org.dtf_settings || {}),
  });
  const [savingDtf, setSavingDtf] = useState(false);
  const [dtfSavedMsg, setDtfSavedMsg] = useState(false);

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [salePrice, setSalePrice] = useState('0');
  const [costPrice, setCostPrice] = useState('0');
  const [unit, setUnit] = useState('шт');

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ProductCategoryRecord | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  const [dossierProduct, setDossierProduct] = useState<ProductRecord | null>(
    null
  );

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const categoryMap = useMemo(() => {
    const m = new Map<string, ProductCategoryRecord>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const stockByProduct = useMemo(() => {
    const m = new Map<string, WarehouseStockRecord[]>();
    for (const s of initialStock) {
      const list = m.get(s.product_id) || [];
      list.push(s);
      m.set(s.product_id, list);
    }
    return m;
  }, [initialStock]);

  function getTotalStock(productId: string) {
    const list = stockByProduct.get(productId) || [];
    return list.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  }

  function resolveProductCategory(p: ProductRecord): ProductCategoryRecord | null {
    return p.category_id ? categoryMap.get(p.category_id) || null : null;
  }

  const uncategorizedCount = products.filter(
    (p) => !resolveProductCategory(p)
  ).length;

  const filtered = products.filter((p) => {
    const resolvedCat = resolveProductCategory(p);
    if (selectedFolder === 'uncategorized') {
      if (resolvedCat) return false;
    } else if (selectedFolder !== 'all') {
      if (resolvedCat?.id !== selectedFolder) return false;
    }

    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (resolvedCat?.name || '').toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setEditingId(null);
    setName('');
    setSku('');
    setCategoryId(
      selectedFolder !== 'all' && selectedFolder !== 'uncategorized'
        ? selectedFolder
        : ''
    );
    setSalePrice('0');
    setCostPrice('0');
    setUnit('шт');
    setModalOpen(true);
  }

  function openEdit(p: ProductRecord) {
    setEditingId(p.id);
    setName(p.name);
    setSku(p.sku || '');
    setCategoryId(p.category_id || '');
    setSalePrice(String(p.sale_price));
    setCostPrice(String(p.cost_price ?? 0));
    setUnit(p.unit || 'шт');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const chosenCat = categoryId ? categoryMap.get(categoryId) || null : null;
    const payload: Record<string, unknown> = {
      org_id: org.id,
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
      if (dossierProduct?.id === id) setDossierProduct(null);
      router.refresh();
    }
  }

  async function handleSeedCategories() {
    setSavingCat(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('product_categories')
      .insert(
        DEFAULT_CATEGORY_PRESETS.map((c, idx) => ({
          org_id: org.id,
          name: c.name,
          branding_mode: c.branding_mode,
          position: categories.length + idx,
        }))
      )
      .select();
    setSavingCat(false);
    if (!error && data) {
      setCategories([...categories, ...(data as ProductCategoryRecord[])]);
      router.refresh();
    }
  }

  async function handleDeleteCategory(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', id);
    if (!error) {
      setCategories(categories.filter((c) => c.id !== id));
      if (selectedFolder === id) setSelectedFolder('all');
      setCatModalOpen(false);
      router.refresh();
    }
  }

  async function handleAddPrintZone(e: React.FormEvent) {
    e.preventDefault();
    if (!zoneName.trim()) return;
    setSavingZone(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('print_zones')
      .insert({
        org_id: org.id,
        name: zoneName.trim(),
        default_width_cm: Math.max(1, Number(zoneW) || 10),
        default_height_cm: Math.max(1, Number(zoneH) || 10),
        position: printZones.length,
      })
      .select()
      .single();
    setSavingZone(false);
    if (!error && data) {
      setPrintZones([...printZones, data as PrintZoneRecord]);
      setZoneName('');
      router.refresh();
    }
  }

  async function handleSeedZones() {
    setSavingZone(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('print_zones')
      .insert(
        DEFAULT_ZONE_PRESETS.map((z, idx) => ({
          org_id: org.id,
          name: z.name,
          default_width_cm: z.default_width_cm,
          default_height_cm: z.default_height_cm,
          position: printZones.length + idx,
        }))
      )
      .select();
    setSavingZone(false);
    if (!error && data) {
      setPrintZones([...printZones, ...(data as PrintZoneRecord[])]);
      router.refresh();
    }
  }

  async function handleDeletePrintZone(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('print_zones').delete().eq('id', id);
    if (!error) {
      setPrintZones(printZones.filter((z) => z.id !== id));
      router.refresh();
    }
  }

  async function handleAddPrintOption(e: React.FormEvent) {
    e.preventDefault();
    if (!optName.trim()) return;
    setSavingOpt(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('print_options')
      .insert({
        org_id: org.id,
        name: optName.trim(),
        price: Number(optPrice) || 0,
        cost_price: canViewCost ? Number(optCost) || 0 : 0,
        position: printOptions.length,
      })
      .select()
      .single();
    setSavingOpt(false);
    if (!error && data) {
      setPrintOptions([...printOptions, data as PrintOptionRecord]);
      setOptName('');
      router.refresh();
    }
  }

  async function handleSeedPresets() {
    setSavingOpt(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('print_options')
      .insert(
        DEFAULT_PRINT_PRESETS.map((p, idx) => ({
          org_id: org.id,
          name: p.name,
          price: p.price,
          cost_price: p.cost_price,
          position: printOptions.length + idx,
        }))
      )
      .select();
    setSavingOpt(false);
    if (!error && data) {
      setPrintOptions([...printOptions, ...(data as PrintOptionRecord[])]);
      router.refresh();
    }
  }

  async function handleDeletePrintOption(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('print_options').delete().eq('id', id);
    if (!error) {
      setPrintOptions(printOptions.filter((o) => o.id !== id));
      router.refresh();
    }
  }

  async function handleSaveDtfSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingDtf(true);
    setDtfSavedMsg(false);
    const supabase = createClient();
    const { error } = await supabase
      .from('organizations')
      .update({ dtf_settings: dtfSettings })
      .eq('id', org.id);
    setSavingDtf(false);
    if (!error) {
      setDtfSavedMsg(true);
      setTimeout(() => setDtfSavedMsg(false), 2500);
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
            Категорії, товари, залишки та довідники брендування ({products.length})
          </p>
        </div>

        {canManage && activeTab === 'products' && (
          <div className="flex flex-wrap gap-2">
            {!categoriesMigrationMissing && (
              <button
                type="button"
                onClick={() => {
                  setEditingCategory(null);
                  setCatModalOpen(true);
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 sm:flex-none"
              >
                <FolderPlus className="h-4 w-4" /> + Категорія
              </button>
            )}
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 sm:flex-none"
              style={{ backgroundColor: org.primary_color }}
            >
              <Plus className="h-4 w-4" /> Додати позицію
            </button>
          </div>
        )}
      </div>

      {/* Tabs: Products vs Print Options */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5 sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition sm:flex-none ${
            activeTab === 'products'
              ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/10 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          Товари / Заготовки ({products.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('options')}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition sm:flex-none ${
            activeTab === 'options'
              ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/10 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Довідники брендування
        </button>
      </div>

      {activeTab === 'options' ? (
        <div className="space-y-4">
          {(printOptionsMigrationMissing || printZonesMigrationMissing) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Виконай SQL-міграцію{' '}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">
                0013_enterprise_branding_schema.sql
              </code>{' '}
              у Supabase → SQL Editor.
            </div>
          )}

          {/* DTF Roll Calculator Settings */}
          <form
            onSubmit={handleSaveDtfSettings}
            className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4 shadow-2xs dark:border-indigo-500/20 dark:bg-indigo-500/5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Калькулятор DTF-рулону (авторозрахунок собівартості)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Система автоматично розкладає принти на ширину рулону з урахуванням відступів та кількості
                </p>
              </div>
              {dtfSavedMsg && (
                <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  Збережено ✓
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Ширина рулону (см)
                </label>
                <input
                  type="number"
                  step="1"
                  value={dtfSettings.roll_width_cm}
                  onChange={(e) =>
                    setDtfSettings({
                      ...dtfSettings,
                      roll_width_cm: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Ціна за метр ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="1"
                  value={dtfSettings.price_per_meter}
                  onChange={(e) =>
                    setDtfSettings({
                      ...dtfSettings,
                      price_per_meter: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Відступ (см)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={dtfSettings.gap_cm}
                  onChange={(e) =>
                    setDtfSettings({
                      ...dtfSettings,
                      gap_cm: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Прес / перенос ({currencySymbol}/шт)
                </label>
                <input
                  type="number"
                  step="1"
                  value={dtfSettings.press_cost_per_print}
                  onChange={(e) =>
                    setDtfSettings({
                      ...dtfSettings,
                      press_cost_per_print: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Націнка (×)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={dtfSettings.markup_multiplier}
                    onChange={(e) =>
                      setDtfSettings({
                        ...dtfSettings,
                        markup_multiplier: Number(e.target.value),
                      })
                    }
                    className={inputCls}
                  />
                </div>
                {canManage && (
                  <button
                    type="submit"
                    disabled={savingDtf}
                    className="h-[42px] shrink-0 rounded-xl bg-indigo-600 px-3.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {savingDtf ? '...' : 'Зберегти'}
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Standard Print Zones Dictionary (ID-referenced) */}
          {!printZonesMigrationMissing && (
            <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Довідник зон нанесення ({printZones.length})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Стандартні зони та типові розміри для швидкого вибору в замовленнях
                  </p>
                </div>
                {canManage && printZones.length === 0 && (
                  <button
                    type="button"
                    disabled={savingZone}
                    onClick={handleSeedZones}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300"
                  >
                    + Завантажити типові зони
                  </button>
                )}
              </div>

              {canManage && (
                <form
                  onSubmit={handleAddPrintZone}
                  className="grid gap-2 sm:grid-cols-4"
                >
                  <input
                    required
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    placeholder="Напр. Серце або Спина А3"
                    className={`${inputCls} sm:col-span-2`}
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      value={zoneW}
                      onChange={(e) => setZoneW(e.target.value)}
                      placeholder="Ш (см)"
                      className={inputCls}
                    />
                    <span className="text-xs text-slate-400">×</span>
                    <input
                      type="number"
                      min="1"
                      value={zoneH}
                      onChange={(e) => setZoneH(e.target.value)}
                      placeholder="В (см)"
                      className={inputCls}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingZone}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: org.primary_color }}
                  >
                    {savingZone ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Додати зону
                  </button>
                </form>
              )}

              <div className="flex flex-wrap gap-2">
                {printZones.map((z) => (
                  <span
                    key={z.id}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                  >
                    {z.name}{' '}
                    <span className="font-mono text-[11px] text-slate-400">
                      ({z.default_width_cm}×{z.default_height_cm} см)
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDeletePrintZone(z.id)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {canManage && (
            <form
              onSubmit={handleAddPrintOption}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Послуги вишивки та фіксовані опції
                </h2>
                {printOptions.length === 0 && (
                  <button
                    type="button"
                    disabled={savingOpt}
                    onClick={handleSeedPresets}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300"
                  >
                    + Завантажити типові (Вишивка)
                  </button>
                )}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-4">
                <input
                  required
                  value={optName}
                  onChange={(e) => setOptName(e.target.value)}
                  placeholder="Напр. Вишивка лого на серці"
                  className={`${inputCls} sm:col-span-2`}
                />
                <input
                  type="number"
                  step="0.01"
                  value={optPrice}
                  onChange={(e) => setOptPrice(e.target.value)}
                  placeholder="Доплата в ціну"
                  className={inputCls}
                />
                <div className="flex gap-2">
                  {canViewCost && (
                    <input
                      type="number"
                      step="0.01"
                      value={optCost}
                      onChange={(e) => setOptCost(e.target.value)}
                      placeholder="Собів."
                      className={inputCls}
                    />
                  )}
                  <button
                    type="submit"
                    disabled={savingOpt}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: org.primary_color }}
                  >
                    {savingOpt ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Додати
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {printOptions.map((opt) => (
              <div
                key={opt.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {opt.name}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs">
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      +{Number(opt.price).toFixed(0)} {currencySymbol}
                    </span>
                    {canViewCost && opt.cost_price !== undefined && (
                      <span className="text-slate-500 dark:text-slate-400">
                        Собів.: +{Number(opt.cost_price).toFixed(0)} {currencySymbol}
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDeletePrintOption(opt.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {categoriesMigrationMissing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Виконай SQL-міграцію{' '}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">
                0012_product_categories.sql
              </code>{' '}
              у Supabase → SQL Editor, щоб увімкнути папки категорій.
            </div>
          )}

          {/* Category Folders Bar */}
          {!categoriesMigrationMissing && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedFolder('all')}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  selectedFolder === 'all'
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-300'
                }`}
              >
                <Folder className="h-3.5 w-3.5" />
                Усі ({products.length})
              </button>

              {categories.map((cat) => {
                const count = products.filter(
                  (p) => p.category_id === cat.id
                ).length;
                const meta =
                  BRANDING_MODE_META[cat.branding_mode] ||
                  BRANDING_MODE_META.none;
                const active = selectedFolder === cat.id;
                return (
                  <div
                    key={cat.id}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFolder(cat.id)}
                      className="inline-flex items-center gap-1.5"
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0" />
                      <span>{cat.name}</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                        }`}
                      >
                        {count}
                      </span>
                      <span
                        className={`hidden rounded-md px-1.5 py-0.5 text-[10px] sm:inline ${
                          active ? 'bg-white/15 text-white' : meta.badgeCls
                        }`}
                      >
                        {meta.short}
                      </span>
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(cat);
                          setCatModalOpen(true);
                        }}
                        title="Налаштувати категорію"
                        className={`ml-0.5 rounded p-0.5 opacity-70 hover:opacity-100 ${
                          active ? 'text-white' : 'text-slate-400'
                        }`}
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {uncategorizedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFolder('uncategorized')}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    selectedFolder === 'uncategorized'
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-dashed border-slate-300 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/15 dark:bg-[#0d1017] dark:text-slate-400'
                  }`}
                >
                  Без папки ({uncategorizedCount})
                </button>
              )}

              {canManage && categories.length === 0 && (
                <button
                  type="button"
                  disabled={savingCat}
                  onClick={handleSeedCategories}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Створити типові папки (Одяг, Чашки, Бейджі)
                </button>
              )}
            </div>
          )}

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
                Позицій у цій папці поки немає.
              </div>
            ) : (
              filtered.map((p) => {
                const margin =
                  canViewCost && p.cost_price !== undefined
                    ? Number(p.sale_price) - Number(p.cost_price)
                    : 0;
                const cat = resolveProductCategory(p);
                const stock = getTotalStock(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => setDossierProduct(p)}
                    className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition active:scale-[0.99] dark:border-white/10 dark:bg-[#0d1017]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {p.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          {p.sku && <span className="font-mono">{p.sku}</span>}
                          {cat ? (
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                                BRANDING_MODE_META[cat.branding_mode].badgeCls
                              }`}
                            >
                              {cat.name}
                            </span>
                          ) : (
                            <span>Без папки</span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            <Warehouse className="h-2.5 w-2.5" /> {stock} {p.unit}
                          </span>
                        </div>
                      </div>
                      {canManage && (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm dark:border-white/10">
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {Number(p.sale_price).toFixed(2)} {currencySymbol} /{' '}
                        {p.unit}
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
                Позицій у цій папці поки немає. Додайте товар або оберіть іншу папку.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">Назва / Артикул</th>
                      <th className="px-5 py-3.5">Папка / Брендування</th>
                      <th className="px-5 py-3.5">Залишок</th>
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
                      const cat = resolveProductCategory(p);
                      const stock = getTotalStock(p.id);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setDossierProduct(p)}
                          className="cursor-pointer transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
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
                          <td className="px-5 py-3.5">
                            {cat ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                  {cat.name}
                                </span>
                                <span
                                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                                    BRANDING_MODE_META[cat.branding_mode]
                                      .badgeCls
                                  }`}
                                >
                                  {BRANDING_MODE_META[cat.branding_mode].short}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                stock > 0
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                              }`}
                            >
                              {stock} {p.unit}
                            </span>
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
                          <td
                            className="px-5 py-3.5 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canManage && (
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
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {dossierProduct && (
            <ProductDossierDrawer
              key={dossierProduct.id}
              product={dossierProduct}
              categories={categories}
              stockRows={stockByProduct.get(dossierProduct.id) || []}
              categoriesMigrationMissing={categoriesMigrationMissing}
              canViewCost={canViewCost}
              canManage={canManage}
              currencySymbol={currencySymbol}
              primaryColor={org.primary_color}
              onClose={() => setDossierProduct(null)}
              onSaved={(updated) => {
                setProducts(
                  products.map((p) => (p.id === updated.id ? updated : p))
                );
                setDossierProduct(updated);
                router.refresh();
              }}
              onDeleted={handleDelete}
            />
          )}

          {catModalOpen && (
            <CategoryModal
              key={editingCategory?.id || 'new-cat'}
              orgId={org.id}
              category={editingCategory}
              nextPosition={categories.length}
              primaryColor={org.primary_color}
              onClose={() => setCatModalOpen(false)}
              onSaved={(saved, isEdit) => {
                setCategories(
                  isEdit
                    ? categories.map((c) => (c.id === saved.id ? saved : c))
                    : [...categories, saved]
                );
                setCatModalOpen(false);
                router.refresh();
              }}
              onDeleted={handleDeleteCategory}
            />
          )}

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
                      placeholder="Худі оверсайз / Чашка біла"
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
                        Папка (категорія)
                      </label>
                      <select
                        disabled={categoriesMigrationMissing}
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Без папки</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({BRANDING_MODE_META[c.branding_mode].short})
                          </option>
                        ))}
                      </select>
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
        </>
      )}
    </div>
  );
}
