'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import {
  Building2,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Shield,
  LogOut,
  Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  onboarding_completed: boolean;
  created_at: string;
  organization_members?: { count: number }[];
}

interface InviteItem {
  id: string;
  email: string;
  role: string;
  token: string;
  org_id: string;
}

export default function SuperAdminClient({
  userEmail,
  initialOrgs,
  initialInvites,
}: {
  userEmail: string;
  initialOrgs: OrgItem[];
  initialInvites: InviteItem[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [joinAsOwner, setJoinAsOwner] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleNameChange(val: string) {
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(autoSlug || `company-${Date.now().toString().slice(-4)}`);
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedInvite(null);
    setLoading(true);

    const res = await fetch('/api/superadmin/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, ownerEmail, joinAsOwner }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || 'Помилка створення');
      return;
    }

    if (data.inviteUrl) {
      setCreatedInvite(`${window.location.origin}${data.inviteUrl}`);
    }

    setName('');
    setSlug('');
    setOwnerEmail('');
    router.refresh();
  }

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] dark:bg-[#090b10]">
      <header className="border-b border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0e1118]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white/10">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                CENTRUM SuperAdmin
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userEmail}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LogOut className="h-3.5 w-3.5" />
              Вийти
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-3">
        {/* Create Org Form */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0e1118] lg:col-span-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Нова компанія / студія
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Створіть робочий простір та згенеруйте інвайт для партнера.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}

          {createdInvite && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <p className="font-semibold">Компанію створено! Інвайт-посилання:</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={createdInvite}
                  className="w-full rounded border border-emerald-300 bg-white px-2 py-1 text-xs dark:border-emerald-500/30 dark:bg-black/30"
                />
                <button
                  type="button"
                  onClick={() => copyText(createdInvite, 'new')}
                  className="rounded bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                >
                  {copiedId === 'new' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateOrg} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Назва компанії
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Rebrand Studio"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                URL-ідентифікатор (slug)
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="rebrand-studio"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Email власника/партнера (опційно)
              </label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="partner@company.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={joinAsOwner}
                onChange={(e) => setJoinAsOwner(e.target.checked)}
                className="rounded border-slate-300"
              />
              Додати мене (Суперадміна) як Owner цієї компанії
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Створити компанію
            </button>
          </form>
        </div>

        {/* Orgs List */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0e1118]">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              <Building2 className="h-4 w-4 text-slate-500" />
              Усі компанії ({initialOrgs.length})
            </h2>

            {initialOrgs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Поки немає жодної компанії. Створіть першу зліва.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {initialOrgs.map((org) => {
                  const membersCount =
                    org.organization_members?.[0]?.count ?? 0;
                  const orgInvites = initialInvites.filter(
                    (i) => i.org_id === org.id
                  );

                  return (
                    <div
                      key={org.id}
                      className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white"
                          style={{ backgroundColor: org.primary_color }}
                        >
                          {org.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {org.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                org.onboarding_completed
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                              }`}
                            >
                              {org.onboarding_completed
                                ? 'Активна'
                                : 'Очікує онбордингу'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            /{org.slug} • Учасників: {membersCount}
                          </p>
                          {orgInvites.map((inv) => (
                            <div
                              key={inv.id}
                              className="mt-1 flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400"
                            >
                              <span>Інвайт для {inv.email}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyText(
                                    `${window.location.origin}/invite/${inv.token}`,
                                    inv.id
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 hover:bg-indigo-100 dark:bg-indigo-500/15"
                              >
                                {copiedId === inv.id ? (
                                  <>
                                    <Check className="h-3 w-3" /> Скопійовано
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> Копіювати
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!org.onboarding_completed && (
                          <Link
                            href={`/onboarding/${org.slug}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                          >
                            Онбординг
                          </Link>
                        )}
                        <Link
                          href={`/w/${org.slug}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20"
                        >
                          Відкрити
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
