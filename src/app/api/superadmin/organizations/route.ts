import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_STATUSES = [
  { name: 'Нове', slug: 'new', color: '#3b82f6', position: 0, is_final: false },
  { name: 'В обробці', slug: 'processing', color: '#f59e0b', position: 1, is_final: false },
  { name: 'Відправлено', slug: 'shipped', color: '#8b5cf6', position: 2, is_final: false },
  { name: 'Виконано', slug: 'done', color: '#10b981', position: 3, is_final: true },
  { name: 'Скасовано', slug: 'cancelled', color: '#ef4444', position: 4, is_final: true },
];

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx?.profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { name, slug, ownerEmail, joinAsOwner } = await request.json();
    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Назва та slug обовʼязкові' },
        { status: 400 }
      );
    }

    const cleanSlug = String(slug)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-');

    const admin = createAdminClient();

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({
        name: String(name).trim(),
        slug: cleanSlug,
        created_by: ctx.user.id,
        onboarding_completed: false,
      })
      .select()
      .single();

    if (orgErr || !org) {
      return NextResponse.json(
        { error: orgErr?.message || 'Не вдалося створити компанію' },
        { status: 400 }
      );
    }

    await admin.from('order_statuses').insert(
      DEFAULT_STATUSES.map((s) => ({
        ...s,
        org_id: org.id,
      }))
    );

    if (joinAsOwner) {
      await admin.from('organization_members').insert({
        org_id: org.id,
        user_id: ctx.user.id,
        role: 'owner',
        permissions: {
          orders: true,
          clients: true,
          products: true,
          view_cost_price: true,
          cashflow: true,
          settings: true,
        },
      });
    }

    let inviteUrl: string | null = null;
    if (ownerEmail && String(ownerEmail).trim()) {
      const { data: invite } = await admin
        .from('organization_invites')
        .insert({
          org_id: org.id,
          email: String(ownerEmail).trim().toLowerCase(),
          role: 'owner',
          invited_by: ctx.user.id,
        })
        .select('token')
        .single();

      if (invite?.token) {
        inviteUrl = `/invite/${invite.token}`;
      }
    }

    return NextResponse.json({ org, inviteUrl });
  } catch (err) {
    console.error('Create org error:', err);
    return NextResponse.json(
      { error: 'Внутрішня помилка сервера' },
      { status: 500 }
    );
  }
}
