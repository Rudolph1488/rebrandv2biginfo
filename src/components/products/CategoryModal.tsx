'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BrandingMode, ProductCategoryRecord } from '@/types/crm';
import { Loader2, X } from 'lucide-react';

const BRANDING_MODES: Array<{
  mode: BrandingMode;
  label: string;
  desc: string;
}> = [
  {
    mode: 'apparel',
    label: 'Одяг (DTF + Вишивка)',
    desc: 'У замовленні доступний вибір: DTF (зони + рулонний калькулятор) або Вишивка.',
  },
  {
    mode: 'sublimation',
    label: 'Сублімація (тільки макет)',
    desc: 'Без зон і калькулятора. Собівартість і ціна з номенклатури + прикріплення візуалки.',
  },
  {
    mode: 'none',
    label: 'Без брендування',
    desc: 'Звичайний товар або послуга без конструктора нанесення.',
  },
];

export function CategoryModal({
  orgId,
  category,
  nextPosition,
  primaryColor,
  onClose,
  onSaved,
  onDeleted,
}: {
  orgId: string;
  category: ProductCategoryRecord | null;
  nextPosition: number;
  primaryColor: string;
  onClose: () => void;
  onSaved: (saved: ProductCategoryRecord, isEdit: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(category?.name || '');
  const [mode, setMode] = useState<BrandingMode>(
    category?.branding_mode || 'apparel'
  );
  const [saving, setSaving] = useState(false);

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    if (category) {
      const { data, error } = await supabase
        .from('product_categories')
        .update({ name: name.trim(), branding_mode: mode })
        .eq('id', category.id)
        .select()
        .single();
      setSaving(false);
      if (!error && data) {
        onSaved(data as ProductCategoryRecord, true);
      }
    } else {
      const { data, error } = await supabase
        .from('product_categories')
        .insert({
          org_id: orgId,
          name: name.trim(),
          branding_mode: mode,
          position: nextPosition,
        })
        .select()
        .single();
      setSaving(false);
      if (!error && data) {
        onSaved(data as ProductCategoryRecord, false);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722] sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {category ? 'Редагувати папку' : 'Нова категорія (папка)'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Назва папки *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Напр. Одяг, Чашки, Бейджі"
              className={inputCls}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Спосіб брендування в замовленні
            </label>
            {BRANDING_MODES.map((m) => (
              <label
                key={m.mode}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${
                  mode === m.mode
                    ? 'border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-500/10'
                    : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="branding_mode"
                  checked={mode === m.mode}
                  onChange={() => setMode(m.mode)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {m.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {m.desc}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {category ? (
              <button
                type="button"
                onClick={() => onDeleted(category.id)}
                className="rounded-xl border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400"
              >
                Видалити
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Зберегти
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
