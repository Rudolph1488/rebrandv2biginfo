'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ClientRecord, Organization } from '@/types/crm';
import {
  Search,
  Plus,
  Phone,
  Building2,
  MapPin,
  X,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export default function ClientsClient({
  org,
  initialClients,
  totalCount,
  currentPage,
  pageSize,
  initialSearch,
  canDelete,
}: {
  org: Organization;
  initialClients: ClientRecord[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearch: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [createdOrUpdatedClients, setClients] = useState<ClientRecord[]>(initialClients);
  const [searchResults, setSearchResults] = useState<{
    items: ClientRecord[];
    count: number;
  } | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [searching, setSearching] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isSearching = search.trim().length > 0;
  const clients = isSearching && searchResults ? searchResults.items : createdOrUpdatedClients;
  const liveCount = isSearching && searchResults ? searchResults.count : totalCount;

  useEffect(() => {
    const q = search.trim();
    if (!q) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const { data, count } = await supabase
        .from('clients')
        .select(
          'id, org_id, contact_person, company_name, phone, email, np_city_name, np_warehouse_name, created_at',
          { count: 'exact' }
        )
        .eq('org_id', org.id)
        .or(
          `contact_person.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`
        )
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setSearchResults({
          items: data as ClientRecord[],
          count: count ?? data.length,
        });
      }
      setSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [search, org.id]);

  const [contactPerson, setContactPerson] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [npCity, setNpCity] = useState('');
  const [npWarehouse, setNpWarehouse] = useState('');
  const [notes, setNotes] = useState('');

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function goToPage(p: number) {
    const params = new URLSearchParams();
    if (initialSearch) params.set('q', initialSearch);
    params.set('page', String(p));
    router.push(`/w/${org.slug}/clients?${params.toString()}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const payload = {
      org_id: org.id,
      contact_person: contactPerson.trim(),
      company_name: companyName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      np_city_name: npCity.trim() || null,
      np_warehouse_name: npWarehouse.trim() || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      setClients([data as ClientRecord, ...clients]);
      setModalOpen(false);
      setContactPerson('');
      setCompanyName('');
      setPhone('');
      setEmail('');
      setNpCity('');
      setNpWarehouse('');
      setNotes('');
      router.refresh();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!canDelete) return;
    const supabase = createClient();
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (!error) {
      setClients(clients.filter((c) => c.id !== id));
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
            Клієнти
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Усього в базі: <strong className="text-slate-900 dark:text-white">{liveCount.toLocaleString('uk-UA')}</strong> контактів
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 sm:w-auto"
          style={{ backgroundColor: org.primary_color }}
        >
          <Plus className="h-4 w-4" /> Додати клієнта
        </button>
      </div>

      {/* Real-time Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Миттєвий пошук за ПІБ, телефоном, компанією..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-[#0d1017] dark:text-white"
        />
        {searching && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        )}
        {!searching && search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* MOBILE CARDS */}
      <div className="space-y-3 md:hidden">
        {clients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-400">
            Клієнтів не знайдено.
          </div>
        ) : (
          clients.map((c) => (
            <Link
              key={c.id}
              href={`/w/${org.slug}/clients/${c.id}`}
              className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition active:scale-[0.99] dark:border-white/10 dark:bg-[#0d1017]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {c.contact_person}
                  </p>
                  {c.company_name && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Building2 className="h-3 w-3" /> {c.company_name}
                    </p>
                  )}
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {c.phone && (
                  <p className="flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-400">
                    <Phone className="h-3.5 w-3.5" /> {c.phone}
                  </p>
                )}
                {(c.np_city_name || c.np_warehouse_name) && (
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>
                      {c.np_city_name}
                      {c.np_warehouse_name ? `, ${c.np_warehouse_name}` : ''}
                    </span>
                  </p>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0d1017] md:block">
        {clients.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Клієнтів не знайдено.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Контакт / Компанія</th>
                  <th className="px-5 py-3.5">Телефон / Email</th>
                  <th className="px-5 py-3.5">Нова Пошта</th>
                  <th className="px-5 py-3.5 text-right">Досьє</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/w/${org.slug}/clients/${c.id}`)}
                    className="cursor-pointer transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {c.contact_person}
                      </p>
                      {c.company_name && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <Building2 className="h-3 w-3" /> {c.company_name}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {c.phone && (
                        <p className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {c.phone}
                        </p>
                      )}
                      {c.email && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {c.email}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                      {c.np_city_name || c.np_warehouse_name ? (
                        <span className="flex items-start gap-1">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>
                            {c.np_city_name}
                            {c.np_warehouse_name ? `, ${c.np_warehouse_name}` : ''}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className="px-5 py-3.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/w/${org.slug}/clients/${c.id}`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          Відкрити
                        </Link>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            Сторінка <strong className="text-slate-900 dark:text-white">{currentPage}</strong> з{' '}
            <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Назад
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40 dark:border-white/10 dark:bg-[#0d1017] dark:text-slate-200"
            >
              Вперед <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* CREATE CLIENT BOTTOM-SHEET / MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#131722] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Новий клієнт
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Контактна особа *
                  </label>
                  <input
                    required
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Іван Петренко"
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
                    placeholder="ТОВ Рога і Копита"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Телефон
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+380..."
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
                    placeholder="client@mail.com"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Місто (НП)
                  </label>
                  <input
                    value={npCity}
                    onChange={(e) => setNpCity(e.target.value)}
                    placeholder="Київ"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Відділення / Поштомат
                  </label>
                  <input
                    value={npWarehouse}
                    onChange={(e) => setNpWarehouse(e.target.value)}
                    placeholder="Відділення №5"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Нотатки
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
