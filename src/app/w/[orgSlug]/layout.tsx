import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOrgAccess } from '@/lib/auth';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';
import ThemeToggle from '@/components/ThemeToggle';
import { NotificationPrompt } from '@/components/NotificationPrompt';
import { Plus, Sparkles } from 'lucide-react';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, membership, permissions, memberships, profile, user, isAdmin } =
    await requireOrgAccess(orgSlug);

  if (!org.onboarding_completed && isAdmin) {
    redirect(`/onboarding/${org.slug}`);
  }

  return (
    <div className="bg-dot-grid flex min-h-screen flex-col bg-[#f4f5f8] dark:bg-[#07080d] lg:flex-row">
      <WorkspaceSidebar
        org={org}
        role={membership.role}
        permissions={permissions}
        memberships={memberships}
        isSuperAdmin={Boolean(profile?.is_super_admin)}
        userEmail={user.email || ''}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop Floating Glass Top Header */}
        <header className="sticky top-3 z-30 mx-6 mt-3 hidden h-14 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-5 shadow-2xs backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1017]/80 lg:flex">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800 dark:bg-white/10 dark:text-slate-200">
              <Sparkles
                className="h-3 w-3"
                style={{ color: org.primary_color }}
              />
              {org.name}
            </span>
            <span className="text-slate-300 dark:text-white/20">/</span>
            <span className="font-medium">CENTRUM OS</span>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            {(isAdmin || permissions.orders) && (
              <Link
                href={`/w/${org.slug}/orders`}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: org.primary_color }}
              >
                <Plus className="h-3.5 w-3.5" />
                Нове замовлення
              </Link>
            )}
          </div>
        </header>

        <NotificationPrompt orgId={org.id} />

        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-6 lg:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
