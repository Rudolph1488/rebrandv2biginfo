import * as webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import type { OrgPermissions } from '@/types/crm';

let vapidConfigured = false;

function ensureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@rebrand.com.ua';

  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

export interface SendPushParams {
  orgId: string;
  eventType: string;
  title: string;
  body: string;
  url?: string;
  targetPermission?: keyof OrgPermissions;
  targetUserId?: string;
}

export async function sendOrgPushNotification(params: SendPushParams): Promise<{
  sent: number;
  failed: number;
}> {
  if (!ensureVapid()) {
    return { sent: 0, failed: 0 };
  }

  const admin = createAdminClient();

  let targetUserIds: string[] = [];

  if (params.targetUserId) {
    targetUserIds = [params.targetUserId];
  } else {
    const { data: members } = await admin
      .from('organization_members')
      .select('user_id, role, permissions, push_permission')
      .eq('org_id', params.orgId)
      .eq('push_permission', 'granted');

    targetUserIds = (members || [])
      .filter((m) => {
        if (!params.targetPermission) return true;
        if (m.role === 'owner' || m.role === 'admin') return true;
        if (
          params.targetPermission === 'production' &&
          m.role === 'producer'
        ) {
          return true;
        }
        const perms = m.permissions as Partial<OrgPermissions> | null;
        return Boolean(perms?.[params.targetPermission]);
      })
      .map((m) => m.user_id);
  }

  if (targetUserIds.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('org_id', params.orgId)
    .eq('is_active', true)
    .in('user_id', targetUserIds);

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    url: params.url || '/',
    tag: `${params.eventType}-${Date.now()}`,
  });

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) return;
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id);
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    await admin
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', expiredIds);
  }

  await admin.from('notification_logs').insert({
    org_id: params.orgId,
    user_id: params.targetUserId || null,
    event_type: params.eventType,
    title: params.title,
    body: params.body,
    url: params.url || null,
    status: sent > 0 ? 'sent' : 'failed',
  });

  return { sent, failed };
}
