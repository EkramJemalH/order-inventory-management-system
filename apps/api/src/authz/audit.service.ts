import { db, auditEvents } from "@repo/db";

export interface LogAuditEventParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValues: params.oldValues || null,
      newValues: params.newValues || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (err) {
    console.error("Failed to write audit event:", err);
    // Audit logging should not crash the primary operational request, but is logged to console
  }
}
