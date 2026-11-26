import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_PERMISSIONS = new Set([
  'default',
  'granted',
  'denied',
  'unsupported',
]);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const orgId = typeof body.orgId === 'string' ? body.orgId : '';
    const permission =
      typeof body.permission === 'string' && VALID_PERMISSIONS.has(body.permission)
        ? body.permission
        : 'default';

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify membership inside this organization
    const { data: member } = await admin
      .from('organization_members')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();

    const { error: updErr } = await admin
      .from('organization_members')
      .update({
        push_permission: permission,
        push_updated_at: now,
      })
      .eq('id', member.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const sub = body.subscription;
    if (permission === 'granted' && sub?.endpoint) {
      await admin.from('push_subscriptions').upsert(
        {
          org_id: orgId,
          user_id: user.id,
          endpoint: String(sub.endpoint),
          p256dh: sub.keys?.p256dh ? String(sub.keys.p256dh) : null,
          auth: sub.keys?.auth ? String(sub.keys.auth) : null,
          user_agent: request.headers.get('user-agent') || null,
          is_active: true,
          updated_at: now,
        },
        { onConflict: 'user_id,endpoint' }
      );
    } else if (permission === 'denied') {
      await admin
        .from('push_subscriptions')
        .update({ is_active: false, updated_at: now })
        .eq('org_id', orgId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({ ok: true, permission });
  } catch (err) {
    console.error('Notification subscribe error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
