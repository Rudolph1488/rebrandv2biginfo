import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import InviteAcceptClient from './InviteAcceptClient';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('organization_invites')
    .select('id, email, role, expires_at, accepted_at, organization:organizations(name, slug, logo_url)')
    .eq('token', token)
    .maybeSingle();

  if (
    !invite ||
    invite.accepted_at ||
    new Date(invite.expires_at) < new Date()
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Запрошення недійсне
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Це посилання вже використане або термін його дії закінчився.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            На сторінку входу
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const org = Array.isArray(invite.organization)
    ? invite.organization[0]
    : invite.organization;

  return (
    <InviteAcceptClient
      token={token}
      email={invite.email}
      role={invite.role}
      orgName={org?.name || 'Компанія'}
      isLoggedIn={Boolean(user)}
      loggedInEmail={user?.email || null}
    />
  );
}
