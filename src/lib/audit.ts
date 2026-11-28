import { createAdminClient } from '@/lib/supabase/admin';

export async function recordAuditLog(params: {
  orgId: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const admin = createAdminClient();
    await admin.from('audit_logs').insert({
      org_id: params.orgId,
      user_id: params.userId ?? null,
      user_email: params.userEmail ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.warn('audit_logs insert skipped:', err);
  }
}
