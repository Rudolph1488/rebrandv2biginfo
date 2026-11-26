import Link from 'next/link';
import { requireOrgAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Wallet,
  Package,
  Warehouse,
} from 'lucide-react';

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, isAdmin, permissions } = await requireOrgAccess(orgSlug);
  const supabase = await createClient();

  const canViewCost = isAdmin || permissions.view_cost_price;
  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const [ordersRes, clientsRes, statusesRes, stockRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, order_number, status_id, total_amount, total_cost, source_name, created_at, client:clients(contact_person)'
      )
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id),
    supabase
      .from('order_statuses')
      .select('id, name, color, is_final, position')
      .eq('org_id', org.id)
      .order('position', { ascending: true }),
    supabase
      .from('warehouse_stock')
      .select('id, quantity, min_quantity, product:products(name)')
      .eq('org_id', org.id),
  ]);

  const orders = ordersRes.data || [];
  const statuses = statusesRes.data || [];
  const stockRows = stockRes.data || [];

  const totalRevenue = orders.reduce(
    (sum, o) => sum + Number(o.total_amount || 0),
    0
  );
  const totalMargin = orders.reduce(
    (sum, o) =>
      sum + (Number(o.total_amount || 0) - Number(o.total_cost || 0)),
    0
  );

  const lowStockItems = stockRows.filter(
    (s) =>
      Number(s.quantity) <= Number(s.min_quantity) && Number(s.min_quantity) > 0
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero Bento Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-[#0d1017]">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-15 blur-3xl"
          style={{ backgroundColor: org.primary_color }}
        />
        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Командний центр
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {org.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Оперативні фінанси, воронка замовлень та стан складів у реальному часі.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(isAdmin || permissions.warehouses) && (
              <Link
                href={`/w/${org.slug}/warehouses`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <Warehouse className="h-3.5 w-3.5" /> Склади
              </Link>
            )}
            {(isAdmin || permissions.cashflow) && (
              <Link
                href={`/w/${org.slug}/cashflow`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <Wallet className="h-3.5 w-3.5" /> Каса
              </Link>
            )}
            {(isAdmin || permissions.products) && (
              <Link
                href={`/w/${org.slug}/products`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <Package className="h-3.5 w-3.5" /> Товари
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* KPI Bento Row with Sparklines */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-slate-300 dark:border-white/10 dark:bg-[#0d1017] dark:hover:border-white/20 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Виручка
            </span>
            <TrendingUp
              className="h-4 w-4"
              style={{ color: org.primary_color }}
            />
          </div>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {totalRevenue.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}{' '}
            {currencySymbol}
          </p>
          <svg
            viewBox="0 0 120 28"
            className="mt-3 h-6 w-full overflow-visible"
            fill="none"
          >
            <path
              d="M2 22 C 25 20, 40 10, 62 14 C 82 18, 98 6, 118 4"
              stroke={org.primary_color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {canViewCost ? (
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-slate-300 dark:border-white/10 dark:bg-[#0d1017] dark:hover:border-white/20 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Маржа
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                Чистими
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-2xl">
              +{totalMargin.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}{' '}
              {currencySymbol}
            </p>
            <svg
              viewBox="0 0 120 28"
              className="mt-3 h-6 w-full overflow-visible"
              fill="none"
            >
              <path
                d="M2 24 C 30 22, 48 16, 70 12 C 92 8, 105 9, 118 3"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Клієнти
              </span>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
              {clientsRes.count ?? 0}
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-slate-300 dark:border-white/10 dark:bg-[#0d1017] dark:hover:border-white/20 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Замовлень
            </span>
            <ShoppingBag className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {orders.length}
          </p>
          <p className="mt-3 text-[11px] font-medium text-slate-400">
            Клієнтів у базі: {clientsRes.count ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-slate-300 dark:border-white/10 dark:bg-[#0d1017] dark:hover:border-white/20 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Дефіцит
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${
                lowStockItems.length > 0 ? 'text-amber-500' : 'text-slate-400'
              }`}
            />
          </div>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {lowStockItems.length}
          </p>
          <p className="mt-3 text-[11px] font-medium text-slate-400">
            {lowStockItems.length > 0
              ? 'Потрібне прибуткування'
              : 'Залишки в нормі'}
          </p>
        </div>
      </div>

      {/* 2-Column Analytical Bento Grid */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Funnel Breakdown */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Воронка замовлень
            </h2>
            <Link
              href={`/w/${org.slug}/orders`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Канбан <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {statuses.length === 0 ? (
            <p className="text-xs text-slate-400">Етапи ще не налаштовані.</p>
          ) : (
            <div className="space-y-3.5">
              {statuses.map((st) => {
                const count = orders.filter((o) => o.status_id === st.id).length;
                const pct =
                  orders.length > 0
                    ? Math.round((count / orders.length) * 100)
                    : 0;
                return (
                  <div key={st.id}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: st.color }}
                        />
                        {st.name}
                      </span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: st.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Останні замовлення
            </h2>
            <Link
              href={`/w/${org.slug}/orders`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Усі <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-white/10">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Поки немає замовлень
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Створіть перше замовлення — воно одразу з&apos;явиться тут.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {orders.slice(0, 6).map((ord) => {
                const st = statuses.find((s) => s.id === ord.status_id);
                const clientObj = Array.isArray(ord.client)
                  ? ord.client[0]
                  : ord.client;
                return (
                  <div
                    key={ord.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-slate-400">
                        #{ord.order_number}
                      </span>
                      <span className="truncate font-medium text-slate-900 dark:text-white">
                        {clientObj?.contact_person || 'Без клієнта'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      {st && (
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: `${st.color}20`,
                            color: st.color,
                          }}
                        >
                          {st.name}
                        </span>
                      )}
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {Number(ord.total_amount).toFixed(0)} {currencySymbol}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
