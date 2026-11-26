import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/auth';

export default async function HomePage() {
  const ctx = await getUserContext();

  if (!ctx) {
    redirect('/login');
  }

  if (ctx.memberships.length > 0) {
    const first = ctx.memberships[0];
    const isAdmin = first.role === 'owner' || first.role === 'admin';
    if (!first.organization.onboarding_completed && isAdmin) {
      redirect(`/onboarding/${first.organization.slug}`);
    }
    if (
      first.role === 'producer' ||
      (!isAdmin &&
        !first.permissions?.orders &&
        !first.permissions?.cashflow &&
        Boolean(first.permissions?.production))
    ) {
      redirect(`/w/${first.organization.slug}/production`);
    }
    redirect(`/w/${first.organization.slug}`);
  }

  if (ctx.profile?.is_super_admin) {
    redirect('/superadmin');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Очікування запрошення
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Ваш акаунт ({ctx.user.email}) поки не прив&apos;язаний до жодної
          компанії. Зверніться до адміністратора за інвайт-посиланням.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Перейти до входу
          </Link>
        </div>
      </div>
    </div>
  );
}
