'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type {
  OrderStatus,
  Organization,
  OrgPermissions,
  OrgRole,
} from '@/types/crm';
import {
  Palette,
  Kanban,
  Users,
  Plug,
  Copy,
  Check,
  Plus,
  Loader2,
  Trash2,
  Upload,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface MemberRow {
  id: string;
  user_id: string;
  role: OrgRole;
  permissions: OrgPermissions;
  profile: { email: string; full_name: string | null } | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  token: string;
}

interface ChannelRow {
  id: string;
  type: string;
  name: string;
  is_active: boolean;
  webhook_secret: string;
}

const COLOR_PRESETS = [
  '#4f46e5',
  '#2563eb',
  '#0f172a',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
];

const PERMISSION_LABELS: Array<{ key: keyof OrgPermissions; label: string }> = [
  { key: 'orders', label: 'Замовлення' },
  { key: 'calendar', label: 'Календар' },
  { key: 'production', label: 'Виробництво' },
  { key: 'clients', label: 'Клієнти' },
  { key: 'products', label: 'Номенклатура' },
  { key: 'warehouses', label: 'Склади' },
  { key: 'view_cost_price', label: 'Собівартість і маржа' },
  { key: 'cashflow', label: 'Каса' },
  { key: 'settings', label: 'Налаштування' },
];

export default function SettingsClient({
  org,
  isAdmin,
  initialMembers,
  initialInvites,
  initialChannels,
  initialStatuses,
}: {
  org: Organization;
  isAdmin: boolean;
  initialMembers: MemberRow[];
  initialInvites: InviteRow[];
  initialChannels: ChannelRow[];
  initialStatuses: OrderStatus[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'brand' | 'kanban' | 'team' | 'integrations'>(
    'brand'
  );

  // Brand state
  const [orgName, setOrgName] = useState(org.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logo_url);
  const [primaryColor, setPrimaryColor] = useState(org.primary_color);
  const [currency, setCurrency] = useState(org.currency);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandSavedMsg, setBrandSavedMsg] = useState(false);

  // Kanban state
  const [statuses, setStatuses] = useState<
    Array<{ id?: string; name: string; color: string; is_final: boolean }>
  >(
    initialStatuses.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      is_final: s.is_final,
    }))
  );
  const [dragStageIdx, setDragStageIdx] = useState<number | null>(null);
  const [savingKanban, setSavingKanban] = useState(false);
  const [kanbanSavedMsg, setKanbanSavedMsg] = useState(false);

  function moveStage(fromIdx: number, toIdx: number) {
    if (
      fromIdx === toIdx ||
      toIdx < 0 ||
      toIdx >= statuses.length
    ) {
      return;
    }
    const next = [...statuses];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setStatuses(next);
  }

  // Team state
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<
    'admin' | 'manager' | 'producer' | 'viewer'
  >('manager');
  const [inviting, setInviting] = useState(false);

  // Integrations state
  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels);
  const [chType, setChType] = useState('weblium');
  const [chName, setChName] = useState('');
  const [chSecretValue, setChSecretValue] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop() || 'png';
    const path = `${org.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('org-logos')
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('org-logos').getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    }
    setUploadingLogo(false);
  }

  async function handleSaveBrand(e: React.FormEvent) {
    e.preventDefault();
    setSavingBrand(true);
    setBrandSavedMsg(false);
    const supabase = createClient();
    await supabase
      .from('organizations')
      .update({
        name: orgName.trim(),
        logo_url: logoUrl,
        primary_color: primaryColor,
        currency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.id);
    setSavingBrand(false);
    setBrandSavedMsg(true);
    setTimeout(() => setBrandSavedMsg(false), 2500);
    router.refresh();
  }

  async function handleSaveKanban() {
    setSavingKanban(true);
    setKanbanSavedMsg(false);
    const supabase = createClient();

    const keptIds = new Set(statuses.map((s) => s.id).filter(Boolean));
    const removedIds = initialStatuses
      .map((s) => s.id)
      .filter((id) => !keptIds.has(id));

    if (removedIds.length > 0) {
      await supabase
        .from('order_statuses')
        .delete()
        .eq('org_id', org.id)
        .in('id', removedIds);
    }

    const updatedStatuses = [...statuses];
    for (let idx = 0; idx < updatedStatuses.length; idx++) {
      const s = updatedStatuses[idx];
      const payload = {
        name: s.name.trim() || `Етап ${idx + 1}`,
        slug: `stage_${idx + 1}`,
        color: s.color || '#64748b',
        position: idx,
        is_final: Boolean(s.is_final),
      };

      if (s.id) {
        await supabase
          .from('order_statuses')
          .update(payload)
          .eq('id', s.id)
          .eq('org_id', org.id);
      } else {
        const { data: inserted } = await supabase
          .from('order_statuses')
          .insert({ org_id: org.id, ...payload })
          .select('id')
          .single();
        if (inserted) {
          updatedStatuses[idx] = { ...s, id: inserted.id };
        }
      }
    }

    setStatuses(updatedStatuses);
    setSavingKanban(false);
    setKanbanSavedMsg(true);
    setTimeout(() => setKanbanSavedMsg(false), 2500);
    router.refresh();
  }

  async function togglePermission(member: MemberRow, key: keyof OrgPermissions) {
    if (!isAdmin) return;
    const updatedPerms = {
      ...member.permissions,
      [key]: !member.permissions?.[key],
    };
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id ? { ...m, permissions: updatedPerms } : m
      )
    );
    const supabase = createClient();
    await supabase
      .from('organization_members')
      .update({ permissions: updatedPerms })
      .eq('id', member.id);
    router.refresh();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invEmail.trim()) return;
    setInviting(true);
    const supabase = createClient();

    const defaultInvitePermissions: Partial<OrgPermissions> | undefined =
      invRole === 'producer'
        ? {
            orders: false,
            calendar: true,
            production: true,
            clients: false,
            products: false,
            warehouses: false,
            view_cost_price: false,
            cashflow: false,
            settings: false,
          }
        : undefined;

    const { data, error } = await supabase
      .from('organization_invites')
      .insert({
        org_id: org.id,
        email: invEmail.trim().toLowerCase(),
        role: invRole,
        ...(defaultInvitePermissions
          ? { permissions: defaultInvitePermissions }
          : {}),
      })
      .select('id, email, role, token')
      .single();
    if (!error && data) {
      setInvites([data as InviteRow, ...invites]);
      setInvEmail('');
      router.refresh();
    }
    setInviting(false);
  }

  async function handleAddChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!chName.trim()) return;
    setAddingChannel(true);
    const supabase = createClient();

    const config: Record<string, string> = {};
    if (chType === 'novaposhta' && chSecretValue.trim()) {
      config.apiKey = chSecretValue.trim();
    } else if (chType === 'telegram' && chSecretValue.trim()) {
      config.botToken = chSecretValue.trim();
    }

    const { data, error } = await supabase
      .from('integration_channels')
      .insert({
        org_id: org.id,
        type: chType,
        name: chName.trim(),
        config,
      })
      .select('id, type, name, is_active, webhook_secret')
      .single();

    if (!error && data) {
      setChannels([data as ChannelRow, ...channels]);
      setChName('');
      setChSecretValue('');
      router.refresh();
    }
    setAddingChannel(false);
  }

  async function deleteChannel(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('integration_channels')
      .delete()
      .eq('id', id);
    if (!error) {
      setChannels(channels.filter((c) => c.id !== id));
      router.refresh();
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/40';

  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Налаштування — {org.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Бренд компанії, етапи воронки, команда та підключені інтеграції
        </p>
      </div>

      {/* Tabs */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setTab('brand')}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'brand'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          <Palette className="h-3.5 w-3.5" /> Загальні та Бренд
        </button>
        <button
          type="button"
          onClick={() => setTab('kanban')}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'kanban'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          <Kanban className="h-3.5 w-3.5" /> Етапи замовлень
        </button>
        <button
          type="button"
          onClick={() => setTab('team')}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'team'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
          }`}
        >
          <Users className="h-3.5 w-3.5" /> Команда і Доступи ({members.length})
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setTab('integrations')}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              tab === 'integrations'
                ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Plug className="h-3.5 w-3.5" /> Інтеграції ({channels.length})
          </button>
        )}
      </div>

      {/* TAB 1: BRANDING */}
      {tab === 'brand' && (
        <form
          onSubmit={handleSaveBrand}
          className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]"
        >
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 text-2xl font-bold text-white dark:border-white/10"
              style={{ backgroundColor: logoUrl ? '#ffffff' : primaryColor }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                orgName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">
                {uploadingLogo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Завантажити новий логотип
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              <p className="mt-1.5 text-xs text-slate-400">
                PNG, SVG або JPG. Одразу оновиться в сайдбарі та шапці.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Назва компанії
              </label>
              <input
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Валюта
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputCls}
              >
                <option value="UAH">UAH (₴ Гривня)</option>
                <option value="USD">USD ($ Долар)</option>
                <option value="EUR">EUR (€ Євро)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Акцентний колір бренду
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {COLOR_PRESETS.map((c) => {
                const active = primaryColor.toLowerCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPrimaryColor(c)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
                      active
                        ? 'scale-110 border-slate-900 dark:border-white'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {active && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })}
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent dark:border-white/10"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
            <button
              type="submit"
              disabled={savingBrand}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {savingBrand && <Loader2 className="h-4 w-4 animate-spin" />}
              Зберегти налаштування
            </button>
            {brandSavedMsg && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ✓ Збережено
              </span>
            )}
          </div>
        </form>
      )}

      {/* TAB 2: KANBAN STAGES */}
      {tab === 'kanban' && (
        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Налаштуйте етапи замовлень, їхні кольори та фінальні статуси.
          </p>

          <div className="space-y-2">
            {statuses.map((st, idx) => (
              <div
                key={st.id || `new-${idx}`}
                draggable
                onDragStart={() => setDragStageIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragStageIdx !== null) {
                    moveStage(dragStageIdx, idx);
                    setDragStageIdx(null);
                  }
                }}
                onDragEnd={() => setDragStageIdx(null)}
                className={`flex items-center gap-2 rounded-xl border bg-slate-50/50 px-3 py-2 transition dark:bg-white/[0.03] ${
                  dragStageIdx === idx
                    ? 'border-indigo-400 opacity-60 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <span
                  className="cursor-grab text-slate-400 active:cursor-grabbing"
                  title="Перетягніть для зміни порядку"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <input
                  type="color"
                  value={st.color}
                  onChange={(e) => {
                    const next = [...statuses];
                    next[idx] = { ...st, color: e.target.value };
                    setStatuses(next);
                  }}
                  className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={st.name}
                  onChange={(e) => {
                    const next = [...statuses];
                    next[idx] = { ...st, name: e.target.value };
                    setStatuses(next);
                  }}
                  className="flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none dark:text-white"
                />
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveStage(idx, idx - 1)}
                    title="Вгору"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-white/10"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === statuses.length - 1}
                    onClick={() => moveStage(idx, idx + 1)}
                    title="Вниз"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-white/10"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={st.is_final}
                    onChange={(e) => {
                      const next = [...statuses];
                      next[idx] = { ...st, is_final: e.target.checked };
                      setStatuses(next);
                    }}
                  />
                  Фінал
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setStatuses(statuses.filter((_, i) => i !== idx))
                  }
                  className="rounded-lg p-1 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setStatuses([
                ...statuses,
                { name: 'Новий етап', color: '#64748b', is_final: false },
              ])
            }
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <Plus className="h-3.5 w-3.5" /> Додати етап
          </button>

          <div className="flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
            <button
              type="button"
              disabled={savingKanban}
              onClick={handleSaveKanban}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {savingKanban && <Loader2 className="h-4 w-4 animate-spin" />}
              Зберегти етапи
            </button>
            {kanbanSavedMsg && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ✓ Етапи оновлено
              </span>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TEAM & PERMISSIONS */}
      {tab === 'team' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {members.map((m) => {
              const memberIsAdmin = m.role === 'owner' || m.role === 'admin';
              return (
                <div
                  key={m.id}
                  className="flex flex-col justify-between gap-3 py-3.5 lg:flex-row lg:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {m.profile?.full_name || m.profile?.email || 'Користувач'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {m.profile?.email} •{' '}
                      <span className="font-semibold uppercase">{m.role}</span>
                    </p>
                  </div>

                  {memberIsAdmin ? (
                    <span className="self-start rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300 lg:self-auto">
                      Повний доступ
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {PERMISSION_LABELS.map((p) => {
                        const active = Boolean(m.permissions?.[p.key]);
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => togglePermission(m, p.key)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                              active
                                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                                : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/10">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Запросити співробітника
              </h3>
              <form
                onSubmit={handleInvite}
                className="mt-3 flex flex-col gap-2 sm:flex-row"
              >
                <input
                  type="email"
                  required
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  placeholder="manager@company.com"
                  className={`${inputCls} flex-1`}
                />
                <select
                  value={invRole}
                  onChange={(e) =>
                    setInvRole(
                      e.target.value as
                        | 'admin'
                        | 'manager'
                        | 'producer'
                        | 'viewer'
                    )
                  }
                  className={`${inputCls} sm:w-44`}
                >
                  <option value="manager">Менеджер</option>
                  <option value="producer">Виробник</option>
                  <option value="admin">Адмін</option>
                  <option value="viewer">Спостерігач</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: primaryColor }}
                >
                  {inviting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Створити інвайт
                </button>
              </form>

              {invites.length > 0 && (
                <div className="mt-4 space-y-2">
                  {invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs dark:bg-white/5"
                    >
                      <span className="text-slate-700 dark:text-slate-200">
                        <strong>{inv.email}</strong> ({inv.role})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            `${appOrigin}/invite/${inv.token}`,
                            inv.id
                          )
                        }
                        className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {copiedId === inv.id ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Скопійовано
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Копіювати
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INTEGRATIONS */}
      {tab === 'integrations' && isAdmin && (
        <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-[#0d1017]">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Підключені сайти, Telegram та Нова Пошта
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Додайте хоч 2, хоч 10 сайтів — для кожного генерується власний Webhook URL та секретний ключ `x-api-key`.
            </p>
          </div>

          <form
            onSubmit={handleAddChannel}
            className="grid gap-2.5 sm:grid-cols-4"
          >
            <select
              value={chType}
              onChange={(e) => setChType(e.target.value)}
              className={inputCls}
            >
              <option value="weblium">Сайт Weblium</option>
              <option value="b2b">B2B Портал</option>
              <option value="custom_webhook">Власний сайт (Webhook)</option>
              <option value="telegram">Telegram-бот</option>
              <option value="novaposhta">Нова Пошта</option>
            </select>
            <input
              required
              value={chName}
              onChange={(e) => setChName(e.target.value)}
              placeholder="Назва (напр. Сайт Брендування №1)"
              className={inputCls}
            />
            <input
              value={chSecretValue}
              onChange={(e) => setChSecretValue(e.target.value)}
              placeholder={
                chType === 'novaposhta'
                  ? 'API-ключ Нової Пошти'
                  : chType === 'telegram'
                  ? 'Bot Token (@BotFather)'
                  : 'Примітка (опційно)'
              }
              className={inputCls}
            />
            <button
              type="submit"
              disabled={addingChannel}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {addingChannel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Підключити
            </button>
          </form>

          {channels.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {channels.map((ch) => {
                const webhookUrl = `${appOrigin}/api/webhooks/orders/${ch.id}`;
                return (
                  <div
                    key={ch.id}
                    className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {ch.name}
                        </p>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          {ch.type}
                        </span>
                      </div>

                      {(ch.type === 'weblium' ||
                        ch.type === 'b2b' ||
                        ch.type === 'custom_webhook') && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          <button
                            type="button"
                            onClick={() => copyText(webhookUrl, `url-${ch.id}`)}
                            className="inline-flex items-center gap-1 font-mono text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {copiedId === `url-${ch.id}` ? (
                              <>
                                <Check className="h-3 w-3" /> URL скопійовано
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Копіювати Webhook URL
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(ch.webhook_secret, `sec-${ch.id}`)
                            }
                            className="inline-flex items-center gap-1 font-mono text-slate-600 hover:underline dark:text-slate-400"
                          >
                            {copiedId === `sec-${ch.id}` ? (
                              <>
                                <Check className="h-3 w-3" /> x-api-key скопійовано
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Копіювати x-api-key
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteChannel(ch.id)}
                      className="self-start rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 sm:self-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
