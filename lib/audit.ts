// No `server-only` guard — see the comment in lib/db/prisma.ts.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AuditAction =
  | "USER_LOGIN"
  | "USER_LOGIN_FAILED"
  | "USER_LOGOUT"
  | "USER_CREATED"
  | "CONTACT_IMPORTED"
  | "CONTACT_OPTED_OUT"
  | "CONTACT_DELETED"
  | "SUPPRESSION_ADDED"
  | "SUPPRESSION_REMOVED"
  | "CAMPAIGN_CREATED"
  | "CAMPAIGN_STARTED"
  | "CAMPAIGN_PAUSED"
  | "CAMPAIGN_RESUMED"
  | "CAMPAIGN_CANCELLED"
  | "CAMPAIGN_RETRIED"
  | "TEMPLATE_SYNCED"
  | "MESSAGE_SENT"
  | "MESSAGE_FAILED"
  | "PRICING_UPDATED";

interface WriteAuditLogInput {
  userId?: string | null;
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Never pass access tokens, app secrets, or passwords into `metadata` —
 * this table is not access-controlled beyond the /settings/audit-log page.
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

export function ipFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip");
}
