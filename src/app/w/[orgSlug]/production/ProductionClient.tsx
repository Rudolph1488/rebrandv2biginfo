'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { OrderStatus, Organization } from '@/types/crm';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Factory,
  Loader2,
  Package,
  Play,
  RotateCcw,
  Search,
  UserCheck,
  X,
} from 'lucide-react';

export interface ProductionOrderRow {
  id: string;
  order_number: number;
  status_id: string | null;
  deadline: string | null;
  notes: string | null;
  ttn: string | null;
  delivery_city: string | null;
  production_status: 'pending' | 'in_progress' | 'done';
  production_accepted_by: string | null;
  production_accepted_at: string | null;
  production_completed_at: string | null;
  created_at: string;
  order_items: Array<{
    id: string;
    name: string;
    qty: number;
    attributes?: Record<string, string> | null;
  }>;
}

function formatUaDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return y && m && d ? `${d}.${m}.${y}` : dateStr;
}

export default function ProductionClient({
  org,
  currentUserId,
  canOpenOrders,
  statuses,
  initialOrders,
  profileMap,
  migrationMissing = false,
}: {
  org: Organization;
  currentUserId: string;
  canOpenOrders: boolean;
  statuses: OrderStatus[];
  initialOrders: ProductionOrderRow[];
  profileMap: Record<string, string>;
  migrationMissing?: boolean;
}) {
  const router = useRouter();
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [orders, setOrders] = useState<ProductionOrderRow[]>(initialOrders);
  const [filter, setFilter] = useState<'active' | 'pending' | 'in_progress' | 'done'>('active');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const statusMap = useMemo(() => {
    const map = new Map<string, OrderStatus>();
    for (const s of statuses) map.set(s.id, s);
    return map;
  }, [statuses]);

  const counts = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let done = 0;
    for (const o of orders) {
      if (o.production_status === 'done') done++;
      else if (o.production_status === 'in_progress') inProgress++;
      else pending++;
    }
    return { pending, inProgress, done };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'active' && o.production_status === 'done') return false;
      if (filter === 'pending' && o.production_status !== 'pending') return false;
      if (filter === 'in_progress' && o.production_status !== 'in_progress')
        return false;
      if (filter === 'done' && o.production_status !== 'done') return false;

      if (!q) return true;
      const numMatch = String(o.order_number).includes(q.replace('#', ''));
      const notesMatch = (o.notes || '').toLowerCase().includes(q);
      const itemMatch = o.order_items.some((it) =>
        it.name.toLowerCase().includes(q)
      );
      return numMatch || notesMatch || itemMatch;
    });
  }, [orders, filter, search]);

  async function updateProductionStatus(
    orderId: string,
    nextStatus: 'pending' | 'in_progress' | 'done'
  ) {
    setUpdatingId(orderId);
    setErrorMsg(null);
    const now = new Date().toISOString();

    const inWorkStage =
      statuses.find((s) => !s.is_final && /робот|виробницт/i.test(s.name)) ||
      null;

    const patch: Record<string, unknown> = {
      production_status: nextStatus,
      updated_at: now,
    };

    if (nextStatus === 'in_progress') {
      patch.production_accepted_by = currentUserId;
      patch.production_accepted_at = now;
      patch.production_completed_at = null;
      if (inWorkStage) {
        patch.status_id = inWorkStage.id;
      }
    } else if (nextStatus === 'done') {
      patch.production_completed_at = now;
    } else {
      patch.production_completed_at = null;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .eq('org_id', org.id);

    setUpdatingId(null);
    if (error) {
      setErrorMsg(error.message || 'Не вдалося оновити статус виробництва');
      return;
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status_id:
                nextStatus === 'in_progress' && inWorkStage
                  ? inWorkStage.id
                  : o.status_id,
              production_status: nextStatus,
              production_accepted_by:
                nextStatus === 'in_progress'
                  ? currentUserId
                  : o.production_accepted_by,
              production_accepted_at:
                nextStatus === 'in_progress' ? now : o.production_accepted_at,
              production_completed_at:
                nextStatus === 'done' ? now : null,
            }
          : o
      )
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Factory className="h-6 w-6 text-indigo-500" />
            Виробництво
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Заявки з підтверджених замовлень (етап «Підтверджено» і далі)
          </p>
        </div>

        <Link
          href={`/w/${org.slug}/calendar`}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-200 dark:hover:bg-white/5"
        >
          <CalendarDays className="h-4 w-4 text-indigo-500" />
          Відкрити Календар
        </Link>
      </div>

      {migrationMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Щоб модуль Виробництво запрацював, виконай SQL-міграцію{' '}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">
            0006_production_and_producer_role.sql
          </code>{' '}
          у Supabase → SQL Editor.
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-2xs transition hover:border-amber-300 dark:border-white/10 dark:bg-[#0d1017]"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Нові заявки (очікують)
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {counts.pending}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Clock className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('in_progress')}
          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-2xs transition hover:border-indigo-300 dark:border-white/10 dark:bg-[#0d1017]"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Прийнято в роботу
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
              {counts.inProgress}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Play className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('done')}
          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-2xs transition hover:border-emerald-300 dark:border-white/10 dark:bg-[#0d1017]"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Вироблено
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {counts.done}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {[
            { id: 'active', label: `Активні (${counts.pending + counts.inProgress})` },
            { id: 'pending', label: `Очікують (${counts.pending})` },
            { id: 'in_progress', label: `В роботі (${counts.inProgress})` },
            { id: 'done', label: `Вироблено (${counts.done})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                setFilter(t.id as 'active' | 'pending' | 'in_progress' | 'done')
              }
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === t.id
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/10 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за №, товаром, коментарем..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-900 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-[#0d1017] dark:text-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Production Tasks Queue */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center dark:border-white/10 dark:bg-[#0d1017]">
          <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Немає заявок на виробництво у цьому фільтрі
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Щоб заявка з&apos;явилась тут, поставте замовленню дедлайн у Календарі або картці замовлення.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredOrders.map((o) => {
            const st = o.status_id ? statusMap.get(o.status_id) : null;
            const isOverdue =
              Boolean(o.deadline) &&
              o.production_status !== 'done' &&
              (o.deadline as string) < todayKey;
            const isToday = o.deadline === todayKey;
            const acceptedName = o.production_accepted_by
              ? profileMap[o.production_accepted_by] || 'Виробник'
              : null;

            return (
              <div
                key={o.id}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-2xs dark:bg-[#0d1017] ${
                  isOverdue
                    ? 'border-red-200 dark:border-red-500/30'
                    : isToday
                      ? 'border-amber-200 dark:border-amber-500/30'
                      : 'border-slate-200/80 dark:border-white/10'
                }`}
              >
                <div>
                  {/* Top Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {canOpenOrders ? (
                        <Link
                          href={`/w/${org.slug}/orders/${o.id}`}
                          className="inline-flex items-center gap-1 font-mono text-base font-bold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                        >
                          #{o.order_number}
                          <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                        </Link>
                      ) : (
                        <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                          #{o.order_number}
                        </span>
                      )}

                      {st && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                          style={{ backgroundColor: `${st.color}18` }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: st.color }}
                          />
                          {st.name}
                        </span>
                      )}
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
                        isOverdue
                          ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                          : isToday
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                      }`}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      {!o.deadline
                        ? 'Без дедлайну'
                        : isToday
                          ? 'Сьогодні'
                          : isOverdue
                            ? `Прострочено (${formatUaDate(o.deadline)})`
                            : formatUaDate(o.deadline)}
                    </span>
                  </div>

                  {/* Order Items & Attributes (Size, Color, SKU) */}
                  <div className="mt-4 space-y-2">
                    {o.order_items.length === 0 ? (
                      <p className="text-xs text-slate-400">Позиції не вказано</p>
                    ) : (
                      o.order_items.map((item) => {
                        const attrs = item.attributes
                          ? Object.entries(item.attributes).filter(
                              ([, v]) => String(v).trim() !== ''
                            )
                          : [];
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-white/5 dark:bg-white/[0.03]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {item.name}
                              </span>
                              <span className="shrink-0 rounded-md bg-slate-200/70 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-white">
                                × {item.qty}
                              </span>
                            </div>
                            {attrs.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {attrs.map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-2xs dark:bg-[#131722] dark:text-slate-300"
                                  >
                                    {k}: <strong className="text-slate-900 dark:text-white">{v}</strong>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {o.notes && (
                    <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-xs text-slate-700 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-slate-300">
                      <span className="font-semibold">Коментар:</span> {o.notes}
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-white/10">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {o.production_status === 'pending' && (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        Очікує прийняття
                      </span>
                    )}
                    {o.production_status === 'in_progress' && (
                      <span className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400">
                        <UserCheck className="h-3.5 w-3.5" />
                        В роботі ({acceptedName})
                      </span>
                    )}
                    {o.production_status === 'done' && (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Вироблено {acceptedName ? `(${acceptedName})` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {o.production_status === 'pending' && (
                      <button
                        type="button"
                        disabled={updatingId === o.id}
                        onClick={() => updateProductionStatus(o.id, 'in_progress')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {updatingId === o.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Прийняти в роботу
                      </button>
                    )}

                    {o.production_status === 'in_progress' && (
                      <button
                        type="button"
                        disabled={updatingId === o.id}
                        onClick={() => updateProductionStatus(o.id, 'done')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {updatingId === o.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Готово (Вироблено)
                      </button>
                    )}

                    {o.production_status === 'done' && (
                      <button
                        type="button"
                        disabled={updatingId === o.id}
                        onClick={() => updateProductionStatus(o.id, 'in_progress')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        <RotateCcw className="h-3 w-3" /> Повернути в роботу
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
