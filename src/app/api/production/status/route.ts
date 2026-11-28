import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendOrgPushNotification } from '@/lib/push';
import { recordAuditLog } from '@/lib/audit';

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      orgId: string;
      orderId: string;
      productionStatus?: 'pending' | 'in_progress' | 'done';
      action?: 'start' | 'pause' | 'resume' | 'done' | 'reopen';
    };

    const { orgId, orderId } = body;
    const action =
      body.action ||
      (body.productionStatus === 'done'
        ? 'done'
        : body.productionStatus === 'in_progress'
          ? 'start'
          : 'reopen');

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
    const nowMs = Date.now();

    const { data: order } = await admin
      .from('orders')
      .select(
        'id, order_number, status_id, production_status, production_elapsed_seconds, production_timer_started_at'
      )
      .eq('id', orderId)
      .eq('org_id', orgId)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
    }

    const prevElapsed = Number(order.production_elapsed_seconds) || 0;
    const activeDelta = order.production_timer_started_at
      ? Math.max(
          0,
          Math.floor(
            (nowMs - new Date(order.production_timer_started_at).getTime()) /
              1000
          )
        )
      : 0;

    let nextStatusId = order.status_id;
    let nextProductionStatus: 'pending' | 'in_progress' | 'done' =
      (order.production_status as 'pending' | 'in_progress' | 'done') ||
      'pending';
    let nextElapsed = prevElapsed;
    let nextTimerStartedAt: string | null = order.production_timer_started_at;

    const patch: Record<string, unknown> = {
      updated_at: now,
    };

    if (action === 'start' || action === 'reopen') {
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
        patch.status_id = inWorkStage.id;
      }

      nextProductionStatus = 'in_progress';
      nextTimerStartedAt = now;
      patch.production_status = 'in_progress';
      patch.production_accepted_by = ctx.user.id;
      patch.production_accepted_at = now;
      patch.production_completed_at = null;
      patch.production_timer_started_at = now;
    } else if (action === 'pause') {
      nextProductionStatus = 'in_progress';
      nextElapsed = prevElapsed + activeDelta;
      nextTimerStartedAt = null;
      patch.production_status = 'in_progress';
      patch.production_elapsed_seconds = nextElapsed;
      patch.production_timer_started_at = null;
    } else if (action === 'resume') {
      nextProductionStatus = 'in_progress';
      nextTimerStartedAt = now;
      patch.production_status = 'in_progress';
      patch.production_timer_started_at = now;
    } else if (action === 'done') {
      nextProductionStatus = 'done';
      nextElapsed = prevElapsed + activeDelta;
      nextTimerStartedAt = null;
      patch.production_status = 'done';
      patch.production_elapsed_seconds = nextElapsed;
      patch.production_timer_started_at = null;
      patch.production_completed_at = now;
    }

    const { error: updErr } = await admin
      .from('orders')
      .update(patch)
      .eq('id', order.id)
      .eq('org_id', orgId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    await recordAuditLog({
      orgId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      action: `production.${action}`,
      entityType: 'order',
      entityId: order.id,
      metadata: {
        order_number: order.order_number,
        production_status: nextProductionStatus,
        elapsed_seconds: nextElapsed,
      },
    });

    if (action === 'done') {
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

    return NextResponse.json({
      ok: true,
      statusId: nextStatusId,
      productionStatus: nextProductionStatus,
      elapsedSeconds: nextElapsed,
      timerStartedAt: nextTimerStartedAt,
    });
  } catch (err) {
    console.error('Production status update error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
