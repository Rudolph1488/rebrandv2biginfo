'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Organization } from '@/types/crm';
import {
  Upload,
  Palette,
  Kanban,
  Plug,
  Users,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  LayoutDashboard,
  ShoppingCart,
  Wallet,
} from 'lucide-react';

const COLOR_PRESETS = [
  { hex: '#4f46e5', name: 'Indigo' },
  { hex: '#2563eb', name: 'Royal Blue' },
  { hex: '#0f172a', name: 'Obsidian' },
  { hex: '#059669', name: 'Emerald' },
  { hex: '#d97706', name: 'Amber' },
  { hex: '#dc2626', name: 'Crimson' },
  { hex: '#7c3aed', name: 'Violet' },
];

const KANBAN_TEMPLATES = [
  {
    id: 'merch',
    label: 'Виробництво / Брендування',
    desc: 'Ідеально для друку, мерчу та індивідуальних замовлень',
    statuses: [
      { name: 'Нове', color: '#3b82f6', is_final: false },
      { name: 'Дизайн / Макет', color: '#8b5cf6', is_final: false },
      { name: 'У виробництві', color: '#f59e0b', is_final: false },
      { name: 'Відправлено', color: '#06b6d4', is_final: false },
      { name: 'Виконано', color: '#10b981', is_final: true },
    ],
  },
  {
    id: 'ecom',
    label: 'Інтернет-магазин',
    desc: 'Швидка обробка, пакування та ТТН Нової Пошти',
    statuses: [
      { name: 'Нове', color: '#3b82f6', is_final: false },
      { name: 'Підтверджено', color: '#f59e0b', is_final: false },
      { name: 'Упаковано', color: '#8b5cf6', is_final: false },
      { name: 'Відправлено НП', color: '#06b6d4', is_final: false },
      { name: 'Отримано', color: '#10b981', is_final: true },
    ],
  },
  {
    id: 'services',
    label: 'Послуги / Агенція',
    desc: 'Ведення лідів від брифу до закриття проєкту',
    statuses: [
      { name: 'Лід', color: '#3b82f6', is_final: false },
      { name: 'Бриф / Оцінка', color: '#8b5cf6', is_final: false },
      { name: 'В роботі', color: '#f59e0b', is_final: false },
      { name: 'Завершено', color: '#10b981', is_final: true },
    ],
  },
];

export default function OnboardingWizardClient({ org }: { org: Organization }) {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: Branding
  const [name, setName] = useState(org.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logo_url);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(org.primary_color || '#4f46e5');
  const [currency, setCurrency] = useState(org.currency || 'UAH');

  // Step 2: Kanban
  const [selectedTpl, setSelectedTpl] = useState('merch');
  const [statuses, setStatuses] = useState(KANBAN_TEMPLATES[0].statuses);

  // Step 3: Integrations
  const [novaPoshtaKey, setNovaPoshtaKey] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [websiteChannelName, setWebsiteChannelName] = useState('');

  // Step 4: Team
  const [invites, setInvites] = useState<
    Array<{ email: string; role: 'admin' | 'manager' | 'viewer' }>
  >([{ email: '', role: 'manager' }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split('.').pop() || 'png';
    const path = `${org.id}/logo-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('org-logos')
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      setError(`Помилка завантаження логотипу: ${uploadErr.message}`);
      setUploadingLogo(false);
      return;
    }

    const { data } = supabase.storage.from('org-logos').getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    setUploadingLogo(false);
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: org.id,
        name,
        logoUrl,
        primaryColor,
        currency,
        statuses,
        novaPoshtaKey,
        telegramToken,
        websiteChannelName,
        invites,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Помилка збереження налаштувань');
      setSaving(false);
      return;
    }

    router.push(`/w/${org.slug}`);
    router.refresh();
  }

  const stepsMeta = [
    { num: 1, title: 'Ідентичність', icon: Palette },
    { num: 2, title: 'Процеси', icon: Kanban },
    { num: 3, title: 'Інтеграції', icon: Plug },
    { num: 4, title: 'Команда', icon: Users },
  ];

  const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₴';

  return (
    <div className="relative flex min-h-screen flex-col bg-[#fafbff] text-slate-900 lg:flex-row">
      {/* LEFT PANEL: Clean Minimalist Installer */}
      <div className="relative z-10 flex w-full flex-col justify-between bg-white px-6 py-8 sm:px-12 lg:w-[54%] lg:px-16 lg:py-10">
        {/* Top Bar */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/centrum-logo.png"
                alt="CENTRUM"
                className="h-7 w-7 rounded-lg object-contain"
              />
              <span className="text-sm font-bold tracking-tight text-slate-900">
                CENTRUM
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Setup
              </span>
            </div>
            <span className="text-xs font-medium text-slate-400">
              Крок {step} з 4
            </span>
          </div>

          {/* Slim Progress Bar */}
          <div className="mt-6 flex gap-2">
            {stepsMeta.map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                className="group flex flex-1 flex-col gap-1.5 text-left"
              >
                <div
                  className="h-1 w-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor:
                      step >= s.num ? primaryColor : '#e2e8f0',
                  }}
                />
                <span
                  className={`text-[11px] font-medium transition ${
                    step === s.num
                      ? 'text-slate-900'
                      : step > s.num
                      ? 'text-slate-600'
                      : 'text-slate-400'
                  }`}
                >
                  {s.num}. {s.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="my-auto py-8">
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {/* STEP 1: BRANDING */}
          {step === 1 && (
            <div className="space-y-7">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  <Sparkles className="h-3 w-3" /> White-Label простір
                </div>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Налаштуйте бренд компанії
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">
                  Назва, логотип та колір сформують інтерфейс вашої команди.
                </p>
              </div>

              {/* Logo Dropzone */}
              <div className="flex items-center gap-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 text-xl font-bold text-white shadow-sm transition-all"
                  style={{
                    backgroundColor: logoUrl ? '#ffffff' : primaryColor,
                  }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : (
                    name.slice(0, 1).toUpperCase() || 'C'
                  )}
                </div>

                <div className="flex-1">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50">
                    {uploadingLogo ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {logoUrl ? 'Змінити логотип' : 'Завантажити логотип'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    PNG, SVG або JPG. Автоматично з&apos;явиться в сайдбарі.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Назва компанії
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Основна валюта
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white"
                  >
                    <option value="UAH">UAH (₴ Гривня)</option>
                    <option value="USD">USD ($ Долар)</option>
                    <option value="EUR">EUR (€ Євро)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Акцентний колір
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {COLOR_PRESETS.map((c) => {
                    const active = primaryColor.toLowerCase() === c.hex;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setPrimaryColor(c.hex)}
                        title={c.name}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform ${
                          active
                            ? 'scale-110 border-slate-900 shadow-sm'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {active && <Check className="h-4 w-4 text-white" />}
                      </button>
                    );
                  })}
                  <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <span
                      className="h-4 w-4 rounded-full border border-slate-200"
                      style={{ backgroundColor: primaryColor }}
                    />
                    Свій
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: KANBAN */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Етапи замовлень
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Оберіть шаблон під вашу нішу або відредагуйте колонки.
                </p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                {KANBAN_TEMPLATES.map((tpl) => {
                  const active = selectedTpl === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setSelectedTpl(tpl.id);
                        setStatuses(tpl.statuses);
                      }}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-semibold">{tpl.label}</p>
                      <p
                        className={`mt-1 text-[11px] leading-snug ${
                          active ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {tpl.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {statuses.map((st, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2"
                  >
                    <input
                      type="color"
                      value={st.color}
                      onChange={(e) => {
                        const next = [...statuses];
                        next[idx] = { ...st, color: e.target.value };
                        setStatuses(next);
                      }}
                      className="h-6 w-6 cursor-pointer rounded-md border-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={st.name}
                      onChange={(e) => {
                        const next = [...statuses];
                        next[idx] = { ...st, name: e.target.value };
                        setStatuses(next);
                      }}
                      className="flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <input
                        type="checkbox"
                        checked={st.is_final}
                        onChange={(e) => {
                          const next = [...statuses];
                          next[idx] = { ...st, is_final: e.target.checked };
                          setStatuses(next);
                        }}
                        className="rounded border-slate-300"
                      />
                      Фінал
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setStatuses(statuses.filter((_, i) => i !== idx))
                      }
                      className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setStatuses([
                      ...statuses,
                      { name: 'Новий етап', color: '#64748b', is_final: false },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                >
                  <Plus className="h-3.5 w-3.5" /> Додати етап
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: INTEGRATIONS */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Канали та інтеграції
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Опційно. Ви завжди зможете підключити кілька сайтів, ботів та ФОПів у налаштуваннях.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-800">
                    Нова Пошта (API-ключ)
                  </label>
                  <input
                    type="text"
                    value={novaPoshtaKey}
                    onChange={(e) => setNovaPoshtaKey(e.target.value)}
                    placeholder="Напр.: 13fb8598..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm outline-none focus:border-slate-900 focus:bg-white"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-800">
                    Telegram-бот (Bot Token від @BotFather)
                  </label>
                  <input
                    type="text"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456789:AAH..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm outline-none focus:border-slate-900 focus:bg-white"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-800">
                    Перший сайт / джерело лідів (Webhook)
                  </label>
                  <input
                    type="text"
                    value={websiteChannelName}
                    onChange={(e) => setWebsiteChannelName(e.target.value)}
                    placeholder="Напр.: Сайт Брендування №1"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm outline-none focus:border-slate-900 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: TEAM */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Запросіть команду
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Згенеруємо персональні інвайти для ваших менеджерів чи партнерів.
                </p>
              </div>

              <div className="space-y-2.5">
                {invites.map((inv, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="email"
                      value={inv.email}
                      onChange={(e) => {
                        const next = [...invites];
                        next[idx] = { ...inv, email: e.target.value };
                        setInvites(next);
                      }}
                      placeholder="manager@company.com"
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-slate-900 focus:bg-white"
                    />
                    <select
                      value={inv.role}
                      onChange={(e) => {
                        const next = [...invites];
                        next[idx] = {
                          ...inv,
                          role: e.target.value as 'admin' | 'manager' | 'viewer',
                        };
                        setInvites(next);
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm font-medium outline-none focus:border-slate-900 focus:bg-white"
                    >
                      <option value="manager">Менеджер</option>
                      <option value="admin">Адмін</option>
                      <option value="viewer">Спостерігач</option>
                    </select>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setInvites([...invites, { email: '', role: 'manager' }])
                  }
                  className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                >
                  <Plus className="h-3.5 w-3.5" /> Додати ще учасника
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Назад
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {step === 3 && (
              <button
                type="button"
                onClick={() => setStep(4)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Пропустити
              </button>
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                Продовжити <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleFinish}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Запустити простір
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Live Interactive Workspace Preview */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-slate-950 p-10 lg:flex">
        {/* Ambient Glow matching user's primaryColor */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-35 blur-[120px] transition-colors duration-500"
          style={{ backgroundColor: primaryColor }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full opacity-25 blur-[110px] transition-colors duration-500"
          style={{ backgroundColor: primaryColor }}
        />

        <div className="relative z-10 w-full max-w-lg">
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-widest text-slate-400">
            Живе прев&apos;ю вашої CRM
          </p>

          {/* Mock App Window */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl backdrop-blur-xl">
            {/* Window Top Dots */}
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="ml-3 text-[10px] font-mono text-slate-400">
                app.centrum.crm/w/{org.slug}
              </span>
            </div>

            <div className="flex h-[360px]">
              {/* Mini Sidebar */}
              <div className="w-44 border-r border-white/10 bg-slate-950/60 p-3">
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-white/5 p-2">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-bold text-white"
                    style={{
                      backgroundColor: logoUrl ? '#ffffff' : primaryColor,
                    }}
                  >
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoUrl}
                        alt="Preview"
                        className="h-full w-full object-contain p-0.5"
                      />
                    ) : (
                      name.slice(0, 1).toUpperCase() || 'C'
                    )}
                  </div>
                  <span className="truncate text-xs font-semibold text-white">
                    {name || 'Ваша компанія'}
                  </span>
                </div>

                <div className="space-y-1">
                  <div
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Огляд
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Замовлення
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400">
                    <Users className="h-3.5 w-3.5" />
                    Клієнти
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400">
                    <Wallet className="h-3.5 w-3.5" />
                    Каса ({currencySymbol})
                  </div>
                </div>
              </div>

              {/* Mini Canvas */}
              <div className="flex-1 bg-slate-900/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">
                    Канбан замовлень
                  </span>
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                    {statuses.length} етапів
                  </span>
                </div>

                <div className="flex gap-2 overflow-hidden">
                  {statuses.slice(0, 3).map((st, i) => (
                    <div
                      key={i}
                      className="w-1/3 rounded-xl border border-white/10 bg-white/[0.03] p-2"
                    >
                      <div className="mb-2 flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: st.color }}
                        />
                        <span className="truncate text-[10px] font-medium text-slate-200">
                          {st.name}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="rounded-lg bg-white/5 p-2">
                          <div className="h-1.5 w-12 rounded bg-white/20" />
                          <div className="mt-1.5 text-[10px] font-semibold text-slate-300">
                            4 200 {currencySymbol}
                          </div>
                        </div>
                        {i === 0 && (
                          <div className="rounded-lg bg-white/5 p-2">
                            <div className="h-1.5 w-10 rounded bg-white/20" />
                            <div className="mt-1.5 text-[10px] font-semibold text-slate-300">
                              1 850 {currencySymbol}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
