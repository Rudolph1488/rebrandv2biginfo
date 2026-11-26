'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Organization, OrgPermissions, OrgRole } from '@/types/crm';
import type { MembershipWithOrg } from '@/lib/auth';
import ThemeToggle from './ThemeToggle';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  PackagePlus,
  Warehouse,
  Wallet,
  Settings,
  ChevronsUpDown,
  Shield,
  LogOut,
  Check,
  Grid,
  X,
  Plus,
  BookOpen,
  CalendarDays,
} from 'lucide-react';

interface Props {
  org: Organization;
  role: OrgRole;
  permissions: OrgPermissions;
  memberships: MembershipWithOrg[];
  isSuperAdmin: boolean;
  userEmail: string;
}

export default function WorkspaceSidebar({
  org,
  role,
  permissions,
  memberships,
  isSuperAdmin,
  userEmail,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = role === 'owner' || role === 'admin' || isSuperAdmin;
  const base = `/w/${org.slug}`;

  const sections = [
    {
      title: 'Операційка',
      items: [
        { label: 'Огляд', href: base, icon: LayoutDashboard, visible: true },
        {
          label: 'Замовлення',
          href: `${base}/orders`,
          icon: ShoppingCart,
          visible: isAdmin || permissions.orders,
        },
        {
          label: 'Календар',
          href: `${base}/calendar`,
          icon: CalendarDays,
          visible: isAdmin || permissions.orders,
        },
        {
          label: 'Клієнти',
          href: `${base}/clients`,
          icon: Users,
          visible: isAdmin || permissions.clients,
        },
      ],
    },
    {
      title: 'Склад і Фінанси',
      items: [
        {
          label: 'Номенклатура',
          href: `${base}/products`,
          icon: Package,
          visible: isAdmin || permissions.products,
        },
        {
          label: 'Склади',
          href: `${base}/warehouses`,
          icon: Warehouse,
          visible: isAdmin || Boolean(permissions.warehouses),
        },
        {
          label: 'Постачання',
          href: `${base}/supplies`,
          icon: PackagePlus,
          visible: isAdmin || Boolean(permissions.warehouses),
        },
        {
          label: 'Каса',
          href: `${base}/cashflow`,
          icon: Wallet,
          visible: isAdmin || permissions.cashflow,
        },
      ],
    },
    {
      title: 'Система',
      items: [
        {
          label: 'Налаштування',
          href: `${base}/settings`,
          icon: Settings,
          visible: isAdmin || permissions.settings,
        },
        {
          label: 'Документація (Wiki)',
          href: '/wiki',
          icon: BookOpen,
          visible: true,
        },
      ],
    },
  ];

  // Primary 4 tabs for mobile bottom bar
  const mobileTabs = [
    { label: 'Огляд', href: base, icon: LayoutDashboard, visible: true },
    {
      label: 'Замовлення',
      href: `${base}/orders`,
      icon: ShoppingCart,
      visible: isAdmin || permissions.orders,
    },
    {
      label: 'Клієнти',
      href: `${base}/clients`,
      icon: Users,
      visible: isAdmin || permissions.clients,
    },
    {
      label: 'Склади',
      href: `${base}/warehouses`,
      icon: Warehouse,
      visible: isAdmin || Boolean(permissions.warehouses),
    },
  ].filter((t) => t.visible);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col rounded-none border-r border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1017]/95 lg:rounded-2xl lg:border lg:shadow-sm">
      {/* Workspace Switcher */}
      <div className="relative border-b border-slate-100 p-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => setSwitcherOpen(!switcherOpen)}
          className="flex w-full items-center justify-between gap-2 rounded-xl p-2 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 text-xs font-bold text-white shadow-xs dark:border-white/10"
              style={{
                backgroundColor: org.logo_url ? '#ffffff' : org.primary_color,
              }}
            >
              {org.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="h-full w-full object-contain p-0.5"
                />
              ) : (
                org.name.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                {org.name}
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {role}
              </p>
            </div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>

        {switcherOpen && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-[#151923]">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Ваші компанії
            </p>
            <div className="max-h-52 overflow-y-auto">
              {memberships.map((m) => (
                <Link
                  key={m.id}
                  href={`/w/${m.organization.slug}`}
                  onClick={() => {
                    setSwitcherOpen(false);
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  <span className="truncate">{m.organization.name}</span>
                  {m.org_id === org.id && (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                </Link>
              ))}
            </div>
            {isSuperAdmin && (
              <Link
                href="/superadmin"
                onClick={() => {
                  setSwitcherOpen(false);
                  setMobileMenuOpen(false);
                }}
                className="mt-1 flex items-center gap-1.5 border-t border-slate-100 px-2.5 pt-2 pb-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:border-white/10 dark:text-indigo-400"
              >
                <Shield className="h-3.5 w-3.5" />
                Панель Суперадміна
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {sections.map((section) => {
          const visibleItems = section.items.filter((i) => i.visible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === base
                      ? pathname === base
                      : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-all ${
                        active
                          ? 'bg-slate-900/[0.05] font-semibold text-slate-950 dark:bg-white/10 dark:text-white'
                          : 'font-medium text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                          style={{ backgroundColor: org.primary_color }}
                        />
                      )}
                      <Icon
                        className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105"
                        style={active ? { color: org.primary_color } : undefined}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-100 p-3 dark:border-white/10">
        <div className="mb-2 flex items-center gap-2 px-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {userEmail.slice(0, 1).toUpperCase()}
          </div>
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
            {userEmail}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          Вийти з акаунта
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sticky Glass Top Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1017]/85 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex items-center gap-2.5"
        >
          <div
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-white"
            style={{
              backgroundColor: org.logo_url ? '#ffffff' : org.primary_color,
            }}
          >
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logo_url}
                alt={org.name}
                className="h-full w-full object-contain p-0.5"
              />
            ) : (
              org.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <span className="max-w-[160px] truncate text-sm font-bold text-slate-900 dark:text-white">
            {org.name}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {(isAdmin || permissions.orders) && (
            <Link
              href={`${base}/orders`}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-white shadow-xs"
              style={{ backgroundColor: org.primary_color }}
            >
              <Plus className="h-3.5 w-3.5" />
              Замовлення
            </Link>
          )}
        </div>
      </header>

      {/* Desktop Floating Sidebar Rail */}
      <aside className="hidden w-64 shrink-0 p-3 pr-0 lg:block">
        <div className="sticky top-3 h-[calc(100vh-1.5rem)]">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Full Slide-Over Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="relative h-full w-72">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </div>
          <div
            className="flex-1 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Mobile Native-Style Bottom Tab Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1017]/90 lg:hidden">
        <div className="flex h-16 items-center justify-around">
          {mobileTabs.map((t) => {
            const Icon = t.icon;
            const active =
              t.href === base ? pathname === base : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[10px] font-semibold transition ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <div
                  className={`flex h-7 w-11 items-center justify-center rounded-full transition ${
                    active ? 'bg-slate-900/10 dark:bg-white/15' : ''
                  }`}
                >
                  <Icon
                    className="h-4 w-4"
                    style={active ? { color: org.primary_color } : undefined}
                  />
                </div>
                <span className="truncate">{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500"
          >
            <div className="flex h-7 w-11 items-center justify-center rounded-full">
              <Grid className="h-4 w-4" />
            </div>
            <span>Меню</span>
          </button>
        </div>
      </nav>
    </>
  );
}
