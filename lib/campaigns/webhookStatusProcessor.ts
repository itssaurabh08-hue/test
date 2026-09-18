// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { Prisma, type RecipientStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { WhatsAppStatusEvent } from "@/lib/meta/webhookParsing";
import { classifyMetaErrorCode } from "@/lib/meta/errorClassification";
import { transitionRecipientStatus, maybeCompleteCampaign } from "@/lib/campaigns/statusTransition";

const STATUS_MAP: Record<string, RecipientStatus> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

const FORWARD_ORDER: RecipientStatus[] = ["PENDING", "QUEUED", "SENT", "DELIVERED", "READ"];

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Applies one Meta message-status event (sent/delivered/read/failed) to
 * the Message + CampaignRecipient + Campaign rows. Used by both the real
 * webhook route (Phase 7) and the mock-mode status simulator (Phase 6),
 * so both paths exercise identical, idempotent logic.
 *
 * Idempotency: a WebhookEvent row is inserted keyed on the event's
 * dedupeKey (metaMessageId:status:timestamp) before anything else — a
 * unique-constraint violation means this exact event was already
 * processed (e.g. Meta retried the webhook delivery), so we stop here
 * without touching any counters a second time.
 */
export async function applyMessageStatusUpdate(event: WhatsAppStatusEvent): Promise<void> {
  try {
    await prisma.webhookEvent.create({
      data: { dedupeKey: event.dedupeKey, payload: event as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return;
    throw err;
  }

  const newStatus = STATUS_MAP[event.status];
  if (!newStatus) return; // unrecognised status value — ignore rather than crash

  const message = await prisma.message.findFirst({
    where: { metaMessageId: event.metaMessageId },
    orderBy: { createdAt: "desc" },
  });
  if (!message) return; // no matching outbound message — nothing to update

  const now = new Date(Number(event.timestamp) * 1000 || Date.now());
  const messageTimestampField =
    newStatus === "SENT"
      ? "sentAt"
      : newStatus === "DELIVERED"
        ? "deliveredAt"
        : newStatus === "READ"
          ? "readAt"
          : "failedAt";

  const firstError = event.errors[0];
  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: newStatus,
      [messageTimestampField]: now,
      ...(newStatus === "FAILED"
        ? {
            errorCode: firstError?.code?.toString(),
            errorMessage: firstError?.message ?? firstError?.title,
            errorCategory: classifyMetaErrorCode(firstError?.code),
          }
        : {}),
    },
  });

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: message.campaignRecipientId },
  });
  if (!recipient) return;

  const currentIdx = FORWARD_ORDER.indexOf(recipient.status);
  const newIdx = FORWARD_ORDER.indexOf(newStatus);

  if (newStatus === "FAILED") {
    // Don't regress an already-delivered/read message to failed, and
    // don't double-count a recipient that's already terminal.
    if (["DELIVERED", "READ", "FAILED", "CANCELLED"].includes(recipient.status)) return;
    await transitionRecipientStatus({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      from: recipient.status,
      to: "FAILED",
      data: {
        errorCode: firstError?.code?.toString(),
        errorMessage: firstError?.message ?? firstError?.title,
        errorCategory: classifyMetaErrorCode(firstError?.code),
        failedAt: now,
      },
    });
    await maybeCompleteCampaign(recipient.campaignId);
    return;
  }

  if (newIdx === -1 || newIdx <= currentIdx) return; // not forward progress — stale/duplicate, ignore

  await transitionRecipientStatus({
    recipientId: recipient.id,
    campaignId: recipient.campaignId,
    from: recipient.status,
    to: newStatus,
    data: {
      metaMessageId: event.metaMessageId,
      [messageTimestampField]: now,
    },
  });
  await maybeCompleteCampaign(recipient.campaignId);
}
