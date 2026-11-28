'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { recordClientAuditLog } from '@/lib/clientAudit';
import type { CashflowRecord, Organization } from '@/types/crm';
import { ArrowDownLeft, ArrowUpRight, Plus, X, Loader2 } from 'lucide-react';

export default function CashflowClient({
  org,
  initialTransactions,
}: {
  org: Organization;
  initialTransactions: CashflowRecord[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<CashflowRecord[]>(initialTransactions);
  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Оплата замовлення');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const totalIncome = items
    .filter((i) => i.type === 'income')
    .reduce((s, i) => s + Number(i.amount), 0);
  const totalExpense = items
    .filter((i) => i.type === 'expense')
    .reduce((s, i) => s + Number(i.amount), 0);
  const netBalance = totalIncome - totalExpense;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('cashflow_transactions')
      .insert({
        org_id: org.id,
        type,
        amount: Number(amount) || 0,
        category: category.trim() || 'Інше',
        comment: comment.trim() || null,
        occurred_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error && data) {
      await recordClientAuditLog({
        orgId: org.id,
        action: `cashflow.${type}`,
        entityType: 'cashflow_transaction',
        entityId: (data as CashflowRecord).id,
        metadata: {
          amount: Number(amount) || 0,
          category: category.trim() || 'Інше',
        },
      });
      setItems([data as CashflowRecord, ...items]);
      setModalOpen(false);
      setAmount('');
      setComment('');
      router.refresh();
    }
    setSaving(false);
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Каса та фінанси
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Облік надходжень, витрат та балансу компанії
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => {
              setType('income');
              setCategory('Оплата замовлення');
              setModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Прихід
          </button>
          <button
            type="button"
            onClick={() => {
              setType('expense');
              setCategory('Закупівля / Витрати');
              setModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <Plus className="h-4 w-4" /> Витрата
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
            Надходження
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400 sm:mt-2 sm:text-2xl">
            +{totalIncome.toFixed(0)} {currencySymbol}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
            Витрати
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400 sm:mt-2 sm:text-2xl">
            -{totalExpense.toFixed(0)} {currencySymbol}
          </p>
        </div>

        <div className="col-span-2 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:col-span-1 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
            Чистий баланс
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:mt-2 sm:text-2xl">
            {netBalance.toFixed(2)} {currencySymbol}
          </p>
        </div>
      </div>

      {/* MOBILE CARDS */}
      <div className="space-y-3 md:hidden">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-400">
            Операцій поки немає.
          </div>
        ) : (
          items.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
            >
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {tx.category}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {tx.comment ||
                    new Date(tx.occurred_at).toLocaleDateString('uk-UA')}
                </p>
              </div>
              <span
                className={`text-base font-bold tabular-nums ${
                  tx.type === 'income'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {tx.type === 'income' ? '+' : '-'}
                {Number(tx.amount).toFixed(2)} {currencySymbol}
              </span>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0d1017] md:block">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Операцій поки немає.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Тип</th>
                  <th className="px-5 py-3.5">Категорія</th>
                  <th className="px-5 py-3.5">Коментар</th>
                  <th className="px-5 py-3.5">Дата</th>
                  <th className="px-5 py-3.5 text-right">Сума</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3.5">
                      {tx.type === 'income' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                          <ArrowDownLeft className="h-3.5 w-3.5" /> Прихід
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">
                          <ArrowUpRight className="h-3.5 w-3.5" /> Витрата
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                      {tx.category}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                      {tx.comment || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {new Date(tx.occurred_at).toLocaleDateString('uk-UA')}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-bold tabular-nums ${
                        tx.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {Number(tx.amount).toFixed(2)} {currencySymbol}
                    </td>
                  </tr>
                ))}
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
                {type === 'income' ? 'Новий прихід' : 'Нова витрата'}
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
                  Сума ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Категорія
                </label>
                <input
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Коментар
                </label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className={inputCls}
                />
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
