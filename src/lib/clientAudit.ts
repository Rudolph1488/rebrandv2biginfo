import { createClient } from '@/lib/supabase/client';

export async function recordClientAuditLog(params: {
  orgId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      org_id: params.orgId,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Non-blocking audit log
  }
}
