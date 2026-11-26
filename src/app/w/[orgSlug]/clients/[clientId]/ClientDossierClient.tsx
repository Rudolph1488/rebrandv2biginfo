'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type {
  ClientRecord,
  OrderRecord,
  OrderStatus,
  Organization,
} from '@/types/crm';
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  MapPin,
  MessageCircle,
  ShoppingCart,
  TrendingUp,
  Receipt,
  Save,
  Loader2,
  Trash2,
  Truck,
  User,
  Edit3,
} from 'lucide-react';

export default function ClientDossierClient({
  org,
  initialClient,
  orders,
  statuses,
  canViewCost,
  canDelete,
}: {
  org: Organization;
  initialClient: ClientRecord;
  orders: OrderRecord[];
  statuses: OrderStatus[];
  canViewCost: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [client, setClient] = useState<ClientRecord>(initialClient);
  const [tab, setTab] = useState<'overview' | 'orders' | 'edit'>('overview');

  // Quick notes state
  const [quickNotes, setQuickNotes] = useState(initialClient.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Full edit state
  const [contactPerson, setContactPerson] = useState(initialClient.contact_person);
  const [companyName, setCompanyName] = useState(initialClient.company_name || '');
  const [phone, setPhone] = useState(initialClient.phone || '');
  const [email, setEmail] = useState(initialClient.email || '');
  const [tgUsername, setTgUsername] = useState(initialClient.telegram_username || '');
  const [npCity, setNpCity] = useState(initialClient.np_city_name || '');
  const [npWarehouse, setNpWarehouse] = useState(initialClient.np_warehouse_name || '');
  const [notes, setNotes] = useState(initialClient.notes || '');
  const [savingEdit, setSavingEdit] = useState(false);

  const currencySymbol =
    org.currency === 'USD' ? '$' : org.currency === 'EUR' ? '€' : '₴';

  const totalRevenue = orders.reduce(
    (s, o) => s + Number(o.total_amount || 0),
    0
  );
  const avgCheck = orders.length > 0 ? totalRevenue / orders.length : 0;

  const initials = client.contact_person
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  async function handleSaveQuickNotes() {
    setSavingNotes(true);
    setNotesSaved(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('clients')
      .update({
        notes: quickNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)
      .select()
      .single();

    if (!error && data) {
      setClient(data as ClientRecord);
      setNotes(quickNotes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    }
    setSavingNotes(false);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('clients')
      .update({
        contact_person: contactPerson.trim(),
        company_name: companyName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        telegram_username: tgUsername.trim() || null,
        np_city_name: npCity.trim() || null,
        np_warehouse_name: npWarehouse.trim() || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)
      .select()
      .single();

    if (!error && data) {
      setClient(data as ClientRecord);
      setQuickNotes(notes);
      setTab('overview');
      router.refresh();
    }
    setSavingEdit(false);
  }

  async function handleDeleteClient() {
    if (!canDelete) return;
    if (!confirm(`Видалити клієнта "${client.contact_person}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', client.id);
    if (!error) {
      router.push(`/w/${org.slug}/clients`);
      router.refresh();
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Back Link */}
      <Link
        href={`/w/${org.slug}/clients`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Назад до списку клієнтів
      </Link>

      {/* Dossier Header Card */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-[#0d1017]">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-15 blur-3xl"
          style={{ backgroundColor: org.primary_color }}
        />

        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"
              style={{ backgroundColor: org.primary_color }}
            >
              {initials || <User className="h-6 w-6" />}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                {client.contact_person}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {client.company_name && (
                  <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                    <Building2 className="h-3.5 w-3.5" /> {client.company_name}
                  </span>
                )}
                <span>
                  У базі з{' '}
                  {new Date(client.created_at).toLocaleDateString('uk-UA')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/w/${org.slug}/orders?new=1&clientId=${client.id}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 sm:flex-none"
              style={{ backgroundColor: org.primary_color }}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Нове замовлення
            </Link>
            <button
              type="button"
              onClick={() => setTab('edit')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <Edit3 className="h-3.5 w-3.5" /> Редагувати
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={handleDeleteClient}
                className="rounded-xl border border-slate-200 p-2.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:hover:bg-red-500/10"
                title="Видалити клієнта"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3 Financial KPI Cards (LTV, Orders, Avg Check) */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
              Оборот (LTV)
            </span>
            <TrendingUp className="hidden h-4 w-4 text-emerald-500 sm:block" />
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {totalRevenue.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}{' '}
            {currencySymbol}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
              Замовлень
            </span>
            <ShoppingCart className="hidden h-4 w-4 text-slate-400 sm:block" />
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {orders.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0d1017] sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
              Середній чек
            </span>
            <Receipt className="hidden h-4 w-4 text-slate-400 sm:block" />
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {avgCheck.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}{' '}
            {currencySymbol}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'overview'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          Профіль і Доставка
        </button>
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'orders'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          Історія замовлень ({orders.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('edit')}
          className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'edit'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          Редагувати дані
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Contacts & Delivery */}
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Контакти та Нова Пошта
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/10">
                <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Phone className="h-3.5 w-3.5" /> Телефон
                </span>
                {client.phone ? (
                  <a
                    href={`tel:${client.phone}`}
                    className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/10">
                <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Mail className="h-3.5 w-3.5" /> Email
                </span>
                {client.email ? (
                  <a
                    href={`mailto:${client.email}`}
                    className="font-medium text-slate-800 hover:underline dark:text-slate-200"
                  >
                    {client.email}
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/10">
                <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <MessageCircle className="h-3.5 w-3.5" /> Telegram
                </span>
                {client.telegram_username ? (
                  <a
                    href={`https://t.me/${client.telegram_username.replace('@', '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    @{client.telegram_username.replace('@', '')}
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>

              <div className="flex items-start justify-between gap-4 pt-0.5">
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <MapPin className="h-3.5 w-3.5" /> Нова Пошта
                </span>
                <span className="text-right text-xs font-medium text-slate-800 dark:text-slate-200">
                  {client.np_city_name || client.np_warehouse_name
                    ? `${client.np_city_name || ''}${
                        client.np_warehouse_name
                          ? `, ${client.np_warehouse_name}`
                          : ''
                      }`
                    : 'Не вказано'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Notes */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Нотатки менеджера
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                ЄДРПОУ, побажання клієнта, умови співпраці
              </p>
              <textarea
                rows={5}
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                placeholder="Додайте нотатку по клієнту..."
                className={`${inputCls} mt-3`}
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={savingNotes}
                onClick={handleSaveQuickNotes}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: org.primary_color }}
              >
                {savingNotes ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Зберегти нотатку
              </button>
              {notesSaved && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ Збережено
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDER HISTORY */}
      {tab === 'orders' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
          {orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              У цього клієнта ще немає замовлень.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {orders.map((ord) => {
                const st = statuses.find((s) => s.id === ord.status_id);
                return (
                  <Link
                    key={ord.id}
                    href={`/w/${org.slug}/orders/${ord.id}`}
                    className="flex flex-col justify-between gap-2 p-4 transition hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-slate-400">
                        #{ord.order_number}
                      </span>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(ord.created_at).toLocaleDateString('uk-UA')} •{' '}
                          {ord.source_name}
                        </p>
                        {ord.ttn && (
                          <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                            <Truck className="h-3 w-3" /> {ord.ttn}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
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
                      <div className="text-right">
                        <p className="font-bold tabular-nums text-slate-900 dark:text-white">
                          {Number(ord.total_amount).toFixed(2)} {currencySymbol}
                        </p>
                        {canViewCost && ord.total_cost !== undefined && (
                          <p className="text-[11px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                            Маржа:{' '}
                            {(
                              Number(ord.total_amount) - Number(ord.total_cost)
                            ).toFixed(0)}{' '}
                            {currencySymbol}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FULL EDIT */}
      {tab === 'edit' && (
        <form
          onSubmit={handleSaveEdit}
          className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Контактна особа *
              </label>
              <input
                required
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Компанія
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Телефон
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Telegram @username
              </label>
              <input
                value={tgUsername}
                onChange={(e) => setTgUsername(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Місто (Нова Пошта)
              </label>
              <input
                value={npCity}
                onChange={(e) => setNpCity(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Відділення / Поштомат
            </label>
            <input
              value={npWarehouse}
              onChange={(e) => setNpWarehouse(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Нотатки
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: org.primary_color }}
            >
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Зберегти зміни
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
