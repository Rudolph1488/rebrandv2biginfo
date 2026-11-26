'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { OrderRecord, OrderStatus, Organization } from '@/types/crm';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  GripVertical,
  Plus,
  Search,
  Truck,
  X,
} from 'lucide-react';

const MONTH_NAMES = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatUaDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
}

export default function CalendarClient({
  org,
  statuses,
  initialScheduled,
  initialUnscheduled,
  migrationMissing = false,
}: {
  org: Organization;
  statuses: OrderStatus[];
  initialScheduled: OrderRecord[];
  initialUnscheduled: OrderRecord[];
  migrationMissing?: boolean;
}) {
  const router = useRouter();
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const [scheduled, setScheduled] = useState<OrderRecord[]>(initialScheduled);
  const [unscheduled, setUnscheduled] =
    useState<OrderRecord[]>(initialUnscheduled);

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [activeTab, setActiveTab] = useState<'day' | 'overdue' | 'unscheduled'>(
    initialScheduled.length === 0 && initialUnscheduled.length > 0
      ? 'unscheduled'
      : 'day'
  );
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [agendaSearch, setAgendaSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const statusMap = useMemo(() => {
    const map = new Map<string, OrderStatus>();
    for (const s of statuses) map.set(s.id, s);
    return map;
  }, [statuses]);

  const ordersByDate = useMemo(() => {
    const map = new Map<string, OrderRecord[]>();
    for (const o of scheduled) {
      if (!o.deadline) continue;
      const list = map.get(o.deadline) || [];
      list.push(o);
      map.set(o.deadline, list);
    }
    return map;
  }, [scheduled]);

  const todayOrders = useMemo(
    () => ordersByDate.get(todayKey) || [],
    [ordersByDate, todayKey]
  );

  const todayActiveOrders = useMemo(
    () =>
      todayOrders.filter((o) => !(o.status_id && statusMap.get(o.status_id)?.is_final)),
    [todayOrders, statusMap]
  );

  const overdueOrders = useMemo(
    () =>
      scheduled.filter((o) => {
        if (!o.deadline || o.deadline >= todayKey) return false;
        const st = o.status_id ? statusMap.get(o.status_id) : null;
        return !st?.is_final;
      }),
    [scheduled, todayKey, statusMap]
  );

  const unscheduledActive = useMemo(
    () =>
      unscheduled.filter((o) => {
        const st = o.status_id ? statusMap.get(o.status_id) : null;
        return !st?.is_final;
      }),
    [unscheduled, statusMap]
  );

  const viewedMonthKey = `${viewDate.getFullYear()}-${String(
    viewDate.getMonth() + 1
  ).padStart(2, '0')}`;

  const monthCount = useMemo(
    () =>
      scheduled.filter((o) => o.deadline?.startsWith(viewedMonthKey)).length,
    [scheduled, viewedMonthKey]
  );

  // Build calendar cells (Mon-Sun grid)
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    // JS getDay(): Sun=0, Mon=1..Sat=6 -> Mon=0..Sun=6
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const totalDays = lastOfMonth.getDate();
    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

    const cells: Array<{
      dateKey: string;
      dayNum: number;
      inCurrentMonth: boolean;
    }> = [];

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, month, 1 - startOffset + i);
      cells.push({
        dateKey: toDateKey(d),
        dayNum: d.getDate(),
        inCurrentMonth: d.getMonth() === month,
      });
    }
    return cells;
  }, [viewDate]);

  async function handleSetDeadline(orderId: string, newDeadline: string | null) {
    setUpdatingId(orderId);
    setErrorMsg(null);

    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ deadline: newDeadline })
      .eq('id', orderId)
      .eq('org_id', org.id);

    setUpdatingId(null);

    if (error) {
      setErrorMsg(error.message || 'Не вдалося оновити дедлайн');
      return;
    }

    const existingInScheduled = scheduled.find((o) => o.id === orderId);
    const existingInUnscheduled = unscheduled.find((o) => o.id === orderId);
    const target = existingInScheduled || existingInUnscheduled;

    if (target) {
      const updated: OrderRecord = { ...target, deadline: newDeadline };
      if (newDeadline) {
        setScheduled((prev) =>
          [...prev.filter((o) => o.id !== orderId), updated].sort((a, b) =>
            (a.deadline || '').localeCompare(b.deadline || '')
          )
        );
        setUnscheduled((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setScheduled((prev) => prev.filter((o) => o.id !== orderId));
        setUnscheduled((prev) => [updated, ...prev]);
      }
    }
    router.refresh();
  }

  async function handleStatusChange(orderId: string, newStatusId: string) {
    setUpdatingId(orderId);
    setErrorMsg(null);
    const res = await fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, orderId, statusId: newStatusId }),
    });
    const data = await res.json();
    setUpdatingId(null);

    if (!res.ok) {
      setErrorMsg(data.error || 'Помилка зміни статусу');
      return;
    }

    setScheduled((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status_id: newStatusId,
              stock_deducted: data.stockDeducted ?? o.stock_deducted,
            }
          : o
      )
    );
    setUnscheduled((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status_id: newStatusId,
              stock_deducted: data.stockDeducted ?? o.stock_deducted,
            }
          : o
      )
    );
    router.refresh();
  }

  function goToMonth(offset: number) {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1)
    );
  }

  function jumpToToday() {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(todayKey);
    setActiveTab('day');
  }

  const selectedDayOrders = ordersByDate.get(selectedDate) || [];
  const rawAgendaOrders =
    activeTab === 'day'
      ? selectedDayOrders
      : activeTab === 'overdue'
        ? overdueOrders
        : unscheduledActive;

  const agendaOrders = useMemo(() => {
    const q = agendaSearch.trim().toLowerCase();
    if (!q) return rawAgendaOrders;
    return rawAgendaOrders.filter(
      (o) =>
        String(o.order_number).includes(q.replace('#', '')) ||
        (o.client?.contact_person || '').toLowerCase().includes(q) ||
        (o.client?.phone || '').toLowerCase().includes(q)
    );
  }, [rawAgendaOrders, agendaSearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <CalendarDays className="h-6 w-6 text-indigo-500" />
            Календар відвантажень
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Внутрішні дедлайни замовлень та план відправок по днях
          </p>
        </div>

        <Link
          href={`/w/${org.slug}/orders?new=1`}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:opacity-90"
          style={{ backgroundColor: org.primary_color }}
        >
          <Plus className="h-4 w-4" /> Нове замовлення
        </Link>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={jumpToToday}
          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-2xs transition hover:border-indigo-300 dark:border-white/10 dark:bg-[#0d1017] dark:hover:border-indigo-500/40"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Відвантажити сьогодні
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {todayActiveOrders.length}
              <span className="ml-2 text-xs font-medium text-slate-400">
                (усього {todayOrders.length})
              </span>
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Clock className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('overdue')}
          className={`flex items-center justify-between rounded-2xl border p-4 text-left shadow-2xs transition ${
            overdueOrders.length > 0
              ? 'border-red-200 bg-red-50/50 hover:border-red-300 dark:border-red-500/30 dark:bg-red-500/10'
              : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-[#0d1017]'
          }`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Прострочені дедлайни
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums ${
                overdueOrders.length > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {overdueOrders.length}
            </p>
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              overdueOrders.length > 0
                ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                : 'bg-slate-100 text-slate-400 dark:bg-white/10'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
        </button>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Заплановано ({MONTH_NAMES[viewDate.getMonth()]})
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {monthCount}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <CalendarIcon className="h-5 w-5" />
          </div>
        </div>
      </div>

      {migrationMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Щоб зберігати дедлайни в базі, виконай SQL-міграцію{' '}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">
            0005_order_deadline.sql
          </code>{' '}
          у Supabase → SQL Editor.
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Calendar + Day Agenda */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Month Grid */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          {/* Month Nav */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goToMonth(-1)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                title="Попередній місяць"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={jumpToToday}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Сьогодні
              </button>
              <button
                type="button"
                onClick={() => goToMonth(1)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                title="Наступний місяць"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {WEEKDAYS.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {calendarDays.map((cell) => {
              const dayOrders = ordersByDate.get(cell.dateKey) || [];
              const isToday = cell.dateKey === todayKey;
              const isSelected = cell.dateKey === selectedDate;
              const hasOverdue =
                cell.dateKey < todayKey &&
                dayOrders.some(
                  (o) => !(o.status_id && statusMap.get(o.status_id)?.is_final)
                );

              return (
                <div
                  key={cell.dateKey}
                  onClick={() => {
                    setSelectedDate(cell.dateKey);
                    setActiveTab('day');
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverDate !== cell.dateKey) {
                      setDragOverDate(cell.dateKey);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverDate === cell.dateKey) {
                      setDragOverDate(null);
                    }
                  }}
                  onDrop={() => {
                    setDragOverDate(null);
                    if (draggedOrderId) {
                      handleSetDeadline(draggedOrderId, cell.dateKey);
                      setDraggedOrderId(null);
                    }
                  }}
                  className={`group min-h-[68px] cursor-pointer rounded-xl border p-1.5 transition sm:min-h-[104px] sm:p-2 ${
                    dragOverDate === cell.dateKey
                      ? 'border-dashed border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/40 dark:border-indigo-400 dark:bg-indigo-500/20'
                      : isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500/30 dark:border-indigo-400 dark:bg-indigo-500/10'
                        : isToday
                          ? 'border-amber-300 bg-amber-50/30 dark:border-amber-500/40 dark:bg-amber-500/5'
                          : 'border-slate-100 bg-slate-50/40 hover:border-slate-300 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-white/20'
                  } ${!cell.inCurrentMonth ? 'opacity-45' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                        isToday
                          ? 'bg-amber-500 text-white'
                          : isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {dayOrders.length > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:hidden ${
                          hasOverdue
                            ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                            : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                        }`}
                      >
                        {dayOrders.length}
                      </span>
                    )}
                  </div>

                  {/* Desktop order chips */}
                  <div className="mt-1.5 hidden space-y-1 sm:block">
                    {dayOrders.slice(0, 3).map((o) => {
                      const st = o.status_id ? statusMap.get(o.status_id) : null;
                      const isDone = Boolean(st?.is_final);
                      const isOverdue = !isDone && cell.dateKey < todayKey;
                      return (
                        <div
                          key={o.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDraggedOrderId(o.id);
                          }}
                          className={`flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium transition ${
                            isOverdue
                              ? 'bg-red-100/90 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                              : isDone
                                ? 'bg-emerald-50 text-emerald-700 line-through opacity-75 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-white text-slate-700 shadow-2xs dark:bg-white/10 dark:text-slate-200'
                          }`}
                          title={`#${o.order_number} ${o.client?.contact_person || ''}`}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: st?.color || '#64748b' }}
                          />
                          <span className="font-mono text-[10px] opacity-75">
                            #{o.order_number}
                          </span>
                          <span className="truncate">
                            {o.client?.contact_person || 'Клієнт'}
                          </span>
                        </div>
                      );
                    })}
                    {dayOrders.length > 3 && (
                      <p className="px-1 text-[10px] font-semibold text-slate-400">
                        +{dayOrders.length - 3} ще
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 hidden text-[11px] text-slate-400 sm:block">
            Підказка: перетягніть замовлення на іншу дату, щоб швидко перенести дедлайн.
          </p>
        </div>

        {/* Right Side Agenda Panel */}
        <div className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#0d1017]">
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('day')}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'day'
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/10 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              {selectedDate === todayKey ? 'Сьогодні' : formatUaDate(selectedDate)} ({selectedDayOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('overdue')}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'overdue'
                  ? 'bg-white text-red-600 shadow-2xs dark:bg-white/10 dark:text-red-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Простр. ({overdueOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unscheduled')}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'unscheduled'
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/10 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Створені ({unscheduledActive.length})
            </button>
          </div>

          {/* Search inside agenda */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={agendaSearch}
              onChange={(e) => setAgendaSearch(e.target.value)}
              placeholder="Пошук (№, ПІБ, телефон)..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-7 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />
            {agendaSearch && (
              <button
                type="button"
                onClick={() => setAgendaSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {activeTab === 'unscheduled' && agendaOrders.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Перетягніть замовлення на потрібну дату в календарі зліва.
            </p>
          )}

          {/* Orders List */}
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1 lg:max-h-[620px]">
            {agendaOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-white/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {activeTab === 'day'
                    ? 'На цей день відвантажень немає'
                    : activeTab === 'overdue'
                      ? 'Прострочених замовлень немає'
                      : 'Усі активні замовлення мають дедлайн'}
                </p>
              </div>
            ) : (
              agendaOrders.map((o) => {
                const st = o.status_id ? statusMap.get(o.status_id) : null;
                return (
                  <div
                    key={o.id}
                    draggable
                    onDragStart={() => setDraggedOrderId(o.id)}
                    onDragEnd={() => {
                      setDraggedOrderId(null);
                      setDragOverDate(null);
                    }}
                    className="cursor-grab space-y-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition hover:border-indigo-300 active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-indigo-500/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                        <div>
                          <Link
                            href={`/w/${org.slug}/orders/${o.id}`}
                            className="inline-flex items-center gap-1 font-mono text-sm font-bold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                          >
                            #{o.order_number}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </Link>
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {o.client?.contact_person || 'Без клієнта'}
                          </p>
                          {o.client?.phone && (
                            <p className="text-[11px] text-slate-500">
                              {o.client.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                        {Number(o.total_amount).toFixed(0)} {currencySymbol}
                      </span>
                    </div>

                    {(o.delivery_city || o.ttn) && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <Truck className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {o.delivery_city}
                          {o.delivery_warehouse ? `, ${o.delivery_warehouse}` : ''}
                          {o.ttn ? ` • ТТН ${o.ttn}` : ''}
                        </span>
                      </div>
                    )}

                    {/* Status + Deadline Controls */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <select
                        value={o.status_id || ''}
                        disabled={updatingId === o.id}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        className="min-w-[130px] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/10 dark:bg-[#131722] dark:text-slate-200"
                        style={{
                          borderLeftWidth: 3,
                          borderLeftColor: st?.color || '#64748b',
                        }}
                      >
                        {statuses.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      {activeTab === 'unscheduled' ? (
                        <button
                          type="button"
                          disabled={updatingId === o.id}
                          onClick={() => handleSetDeadline(o.id, selectedDate)}
                          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          На {selectedDate === todayKey ? 'сьогодні' : formatUaDate(selectedDate)}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          {activeTab === 'overdue' && (
                            <button
                              type="button"
                              disabled={updatingId === o.id}
                              onClick={() => handleSetDeadline(o.id, todayKey)}
                              className="rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
                            >
                              На сьогодні
                            </button>
                          )}
                          <input
                            type="date"
                            value={o.deadline || ''}
                            disabled={updatingId === o.id}
                            onChange={(e) =>
                              handleSetDeadline(o.id, e.target.value || null)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-white/10 dark:bg-[#131722] dark:text-slate-200"
                          />
                          <button
                            type="button"
                            disabled={updatingId === o.id}
                            onClick={() => handleSetDeadline(o.id, null)}
                            title="Прибрати дедлайн"
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
