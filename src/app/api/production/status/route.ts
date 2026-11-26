import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendOrgPushNotification } from '@/lib/push';

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { orgId, orderId, productionStatus } = (await request.json()) as {
      orgId: string;
      orderId: string;
      productionStatus: 'pending' | 'in_progress' | 'done';
    };

    const membership = ctx.memberships.find((m) => m.org_id === orgId);
    const hasAccess =
      ctx.profile?.is_super_admin ||
      membership?.role === 'owner' ||
      membership?.role === 'admin' ||
      membership?.role === 'producer' ||
      Boolean(membership?.permissions?.production);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: order } = await admin
      .from('orders')
      .select('id, order_number, status_id')
      .eq('id', orderId)
      .eq('org_id', orgId)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
    }

    let nextStatusId = order.status_id;

    if (productionStatus === 'in_progress') {
      const { data: stages } = await admin
        .from('order_statuses')
        .select('id, name, is_final')
        .eq('org_id', orgId)
        .order('position', { ascending: true });

      const inWorkStage = (stages || []).find(
        (s) => !s.is_final && /робот|виробницт/i.test(s.name)
      );
      if (inWorkStage) {
        nextStatusId = inWorkStage.id;
      }
    }

    const patch: Record<string, unknown> = {
      production_status: productionStatus,
      updated_at: now,
    };

    if (productionStatus === 'in_progress') {
      patch.production_accepted_by = ctx.user.id;
      patch.production_accepted_at = now;
      patch.production_completed_at = null;
      if (nextStatusId) patch.status_id = nextStatusId;
    } else if (productionStatus === 'done') {
      patch.production_completed_at = now;
    } else {
      patch.production_completed_at = null;
    }

    const { error: updErr } = await admin
      .from('orders')
      .update(patch)
      .eq('id', order.id)
      .eq('org_id', orgId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    if (productionStatus === 'done') {
      await sendOrgPushNotification({
        orgId,
        targetPermission: 'orders',
        eventType: 'production_done',
        title: `✅ Вироблено замовлення #${order.order_number}`,
        body: 'Готово до пакування та відправки',
        url: membership?.organization?.slug
          ? `/w/${membership.organization.slug}/orders/${order.id}`
          : '/',
      });
    }

    return NextResponse.json({ ok: true, statusId: nextStatusId });
  } catch (err) {
    console.error('Production status update error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
