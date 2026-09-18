// No `server-only` guard — see the comment in lib/db/prisma.ts.
import type { Prisma, RecipientStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Campaign.queued/sent/delivered/read/failed/cancelled are live bucket
 * counts — every recipient is in at most one of these buckets at a time
 * (PENDING has no bucket: it's implicitly totalContacts minus every
 * other bucket). Every status change must go through this helper so the
 * Campaign row's counters never drift from the CampaignRecipient rows.
 */
const COUNTER_FIELD: Partial<Record<RecipientStatus, string>> = {
  QUEUED: "queued",
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

export interface TransitionParams {
  recipientId: string;
  campaignId: string;
  from: RecipientStatus;
  to: RecipientStatus;
  data?: Prisma.CampaignRecipientUpdateInput;
}

/**
 * Atomically updates a recipient's status and the Campaign's bucket
 * counters. `from` must match the recipient's actual current status —
 * callers should read the recipient inside the same logical operation
 * (ideally re-checked with a WHERE clause) to avoid racing another
 * writer; see applyMessageStatusUpdate for the webhook/idempotency case.
 */
export async function transitionRecipientStatus(params: TransitionParams): Promise<boolean> {
  const { recipientId, campaignId, from, to, data } = params;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.campaignRecipient.updateMany({
      where: { id: recipientId, status: from },
      data: { status: to, ...data },
    });
    if (updated.count === 0) {
      // Someone else already moved this recipient out of `from` — skip,
      // don't double-count the campaign buckets.
      return false;
    }

    const decField = COUNTER_FIELD[from];
    const incField = COUNTER_FIELD[to];
    const campaignUpdate: Record<string, { increment?: number; decrement?: number }> = {};
    if (decField) campaignUpdate[decField] = { decrement: 1 };
    if (incField) {
      campaignUpdate[incField] = { ...(campaignUpdate[incField] ?? {}), increment: 1 };
    }
    if (Object.keys(campaignUpdate).length > 0) {
      await tx.campaign.update({ where: { id: campaignId }, data: campaignUpdate });
    }
    return true;
  });
}

/** Marks a campaign COMPLETED once no recipients remain queued/pending. */
export async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== "RUNNING") return;

  const outstanding = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: ["PENDING", "QUEUED"] } },
  });
  if (outstanding > 0) return;

  const allFailed =
    campaign.totalContacts > 0 && campaign.failed === campaign.totalContacts;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: allFailed ? "FAILED" : "COMPLETED", completedAt: new Date() },
  });
}
