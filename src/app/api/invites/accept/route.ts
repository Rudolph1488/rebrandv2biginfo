import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { token, fullName, password } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Токен відсутній' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: invite, error: inviteErr } = await admin
      .from('organization_invites')
      .select('*, organization:organizations(*)')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json(
        { error: 'Запрошення недійсне або термін його дії вийшов' },
        { status: 404 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    let userId = currentUser?.id;

    if (!userId) {
      if (!password || password.length < 6) {
        return NextResponse.json(
          { error: 'Пароль має містити мінімум 6 символів' },
          { status: 400 }
        );
      }

      // Check if user already exists by email
      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id')
        .eq('email', invite.email)
        .maybeSingle();

      if (existingProfile) {
        return NextResponse.json(
          {
            error:
              'Користувач із таким email вже існує. Будь ласка, спочатку увійдіть у свій акаунт, а потім відкрийте це посилання.',
          },
          { status: 409 }
        );
      }

      const { data: createdUser, error: createErr } =
        await admin.auth.admin.createUser({
          email: invite.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || '' },
        });

      if (createErr || !createdUser.user) {
        return NextResponse.json(
          { error: createErr?.message || 'Помилка створення акаунта' },
          { status: 400 }
        );
      }

      userId = createdUser.user.id;

      // Sign in the newly created user via SSR client so cookies are set
      await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });
    }

    const defaultPermissions =
      invite.role === 'owner' || invite.role === 'admin'
        ? {
            orders: true,
            clients: true,
            products: true,
            view_cost_price: true,
            cashflow: true,
            settings: true,
          }
        : invite.permissions;

    const { error: memberErr } = await admin
      .from('organization_members')
      .upsert(
        {
          org_id: invite.org_id,
          user_id: userId,
          role: invite.role,
          permissions: defaultPermissions,
        },
        { onConflict: 'org_id,user_id' }
      );

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    await admin
      .from('organization_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    const org = Array.isArray(invite.organization)
      ? invite.organization[0]
      : invite.organization;

    const isAdmin = invite.role === 'owner' || invite.role === 'admin';
    const redirectTo =
      !org.onboarding_completed && isAdmin
        ? `/onboarding/${org.slug}`
        : `/w/${org.slug}`;

    return NextResponse.json({ ok: true, redirectTo });
  } catch (err) {
    console.error('Accept invite error:', err);
    return NextResponse.json(
      { error: 'Внутрішня помилка сервера' },
      { status: 500 }
    );
  }
}
