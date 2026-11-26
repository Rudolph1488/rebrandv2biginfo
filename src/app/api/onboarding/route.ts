import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

interface StatusInput {
  name: string;
  color: string;
  is_final?: boolean;
}

interface InviteInput {
  email: string;
  role: 'admin' | 'manager' | 'viewer';
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      orgId,
      name,
      logoUrl,
      primaryColor,
      currency,
      statuses,
      novaPoshtaKey,
      telegramToken,
      websiteChannelName,
      invites,
    } = body as {
      orgId: string;
      name: string;
      logoUrl?: string | null;
      primaryColor: string;
      currency: string;
      statuses: StatusInput[];
      novaPoshtaKey?: string;
      telegramToken?: string;
      websiteChannelName?: string;
      invites?: InviteInput[];
    };

    const membership = ctx.memberships.find((m) => m.org_id === orgId);
    const isAllowed =
      ctx.profile?.is_super_admin ||
      membership?.role === 'owner' ||
      membership?.role === 'admin';

    if (!isAllowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();

    // 1. Update organization branding & mark onboarding complete
    const { error: orgErr } = await admin
      .from('organizations')
      .update({
        name: name.trim(),
        logo_url: logoUrl || null,
        primary_color: primaryColor || '#2563eb',
        currency: currency || 'UAH',
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 400 });
    }

    // 2. Replace order statuses if provided
    if (Array.isArray(statuses) && statuses.length > 0) {
      await admin.from('order_statuses').delete().eq('org_id', orgId);
      await admin.from('order_statuses').insert(
        statuses.map((s, idx) => ({
          org_id: orgId,
          name: s.name.trim(),
          slug: `stage_${idx + 1}`,
          color: s.color || '#64748b',
          position: idx,
          is_final: Boolean(s.is_final),
        }))
      );
    }

    // 3. Optional initial integrations
    const channelsToInsert: Array<{
      org_id: string;
      type: string;
      name: string;
      config: Record<string, string>;
    }> = [];

    if (novaPoshtaKey?.trim()) {
      channelsToInsert.push({
        org_id: orgId,
        type: 'novaposhta',
        name: 'Нова Пошта (Основна)',
        config: { apiKey: novaPoshtaKey.trim() },
      });
    }

    if (telegramToken?.trim()) {
      channelsToInsert.push({
        org_id: orgId,
        type: 'telegram',
        name: 'Telegram-бот',
        config: { botToken: telegramToken.trim() },
      });
    }

    if (websiteChannelName?.trim()) {
      channelsToInsert.push({
        org_id: orgId,
        type: 'custom_webhook',
        name: websiteChannelName.trim(),
        config: {},
      });
    }

    if (channelsToInsert.length > 0) {
      await admin.from('integration_channels').insert(channelsToInsert);
    }

    // 4. Optional teammate invites
    const createdInvites: Array<{ email: string; token: string }> = [];
    if (Array.isArray(invites) && invites.length > 0) {
      const validInvites = invites.filter((i) => i.email?.trim());
      if (validInvites.length > 0) {
        const { data: insertedInvites } = await admin
          .from('organization_invites')
          .insert(
            validInvites.map((inv) => ({
              org_id: orgId,
              email: inv.email.trim().toLowerCase(),
              role: inv.role || 'manager',
              invited_by: ctx.user.id,
            }))
          )
          .select('email, token');

        if (insertedInvites) {
          createdInvites.push(...insertedInvites);
        }
      }
    }

    return NextResponse.json({ ok: true, createdInvites });
  } catch (err) {
    console.error('Onboarding error:', err);
    return NextResponse.json(
      { error: 'Внутрішня помилка сервера' },
      { status: 500 }
    );
  }
}
