// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { Queue } from "bullmq";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { getRedisConnection } from "@/lib/queue/connection";
import { writeAuditLog } from "@/lib/audit";

export interface MessageJobData {
  campaignRecipientId: string;
}

export interface MockStatusJobData {
  metaMessageId: string;
  status: "delivered" | "read" | "failed";
  recipientId: string;
}

export const MESSAGE_QUEUE_NAME = "wa-messages";
export const MOCK_STATUS_QUEUE_NAME = "wa-mock-status";

let _messageQueue: Queue<MessageJobData> | null = null;
let _mockStatusQueue: Queue<MockStatusJobData> | null = null;

export function getMessageQueue(): Queue<MessageJobData> {
  if (!_messageQueue) {
    _messageQueue = new Queue<MessageJobData>(MESSAGE_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return _messageQueue;
}

export function getMockStatusQueue(): Queue<MockStatusJobData> {
  if (!_mockStatusQueue) {
    _mockStatusQueue = new Queue<MockStatusJobData>(MOCK_STATUS_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return _mockStatusQueue;
}

async function enqueueRecipientJob(recipientId: string): Promise<void> {
  const env = getEnv();
  await getMessageQueue().add(
    "send",
    { campaignRecipientId: recipientId },
    {
      jobId: recipientId,
      attempts: 1 + env.RETRY_ATTEMPTS,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

export class CampaignQueueError extends Error {}

export async function startCampaign(
  campaignId: string,
  userId: string
): Promise<{ recipientCount: number }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new CampaignQueueError("Campaign not found.");
  if (campaign.status !== "DRAFT") {
    throw new CampaignQueueError(`Campaign cannot be started from status ${campaign.status}.`);
  }

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    select: { id: true },
  });
  if (pending.length === 0) {
    throw new CampaignQueueError("Campaign has no pending recipients to queue.");
  }

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "RUNNING", startedAt: new Date(), queued: pending.length },
    }),
    prisma.campaignRecipient.updateMany({
      where: { campaignId, status: "PENDING" },
      data: { status: "QUEUED", queuedAt: new Date() },
    }),
  ]);

  for (const r of pending) {
    await enqueueRecipientJob(r.id);
  }

  await writeAuditLog({
    userId,
    action: "CAMPAIGN_STARTED",
    resource: "Campaign",
    resourceId: campaignId,
    metadata: { recipientCount: pending.length },
  });

  return { recipientCount: pending.length };
}

export async function pauseCampaign(campaignId: string, userId: string): Promise<void> {
  const result = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "RUNNING" },
    data: { status: "PAUSED" },
  });
  if (result.count === 0) {
    throw new CampaignQueueError("Campaign is not currently running.");
  }
  await writeAuditLog({ userId, action: "CAMPAIGN_PAUSED", resource: "Campaign", resourceId: campaignId });
}

export async function resumeCampaign(campaignId: string, userId: string): Promise<void> {
  const result = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "PAUSED" },
    data: { status: "RUNNING" },
  });
  if (result.count === 0) {
    throw new CampaignQueueError("Campaign is not currently paused.");
  }
  await writeAuditLog({ userId, action: "CAMPAIGN_RESUMED", resource: "Campaign", resourceId: campaignId });
}

export async function cancelCampaign(campaignId: string, userId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new CampaignQueueError("Campaign not found.");
  if (!["DRAFT", "RUNNING", "PAUSED"].includes(campaign.status)) {
    throw new CampaignQueueError(`Campaign cannot be cancelled from status ${campaign.status}.`);
  }

  const [pendingCount, queuedCount] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId, status: "PENDING" } }),
    prisma.campaignRecipient.count({ where: { campaignId, status: "QUEUED" } }),
  ]);

  await prisma.$transaction([
    prisma.campaignRecipient.updateMany({
      where: { campaignId, status: { in: ["PENDING", "QUEUED"] } },
      data: { status: "CANCELLED" },
    }),
    prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        queued: { decrement: queuedCount },
        cancelled: { increment: pendingCount + queuedCount },
      },
    }),
  ]);

  await writeAuditLog({ userId, action: "CAMPAIGN_CANCELLED", resource: "Campaign", resourceId: campaignId });
}

export async function retryFailedRecipients(
  campaignId: string,
  userId: string
): Promise<{ retried: number }> {
  const eligible = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "FAILED", errorCategory: "TRANSIENT" },
    select: { id: true },
  });
  if (eligible.length === 0) {
    return { retried: 0 };
  }

  await prisma.$transaction([
    prisma.campaignRecipient.updateMany({
      where: { id: { in: eligible.map((r) => r.id) } },
      data: {
        status: "QUEUED",
        queuedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        errorCategory: null,
      },
    }),
    prisma.campaign.update({
      where: { id: campaignId },
      data: {
        failed: { decrement: eligible.length },
        queued: { increment: eligible.length },
        status: "RUNNING",
        completedAt: null,
      },
    }),
  ]);

  for (const r of eligible) {
    await enqueueRecipientJob(r.id);
  }

  await writeAuditLog({
    userId,
    action: "CAMPAIGN_RETRIED",
    resource: "Campaign",
    resourceId: campaignId,
    metadata: { retried: eligible.length },
  });

  return { retried: eligible.length };
}

/** Schedules simulated delivered/read status events for a mock-mode send (see lib/queue/worker.ts). */
export async function scheduleMockStatusProgression(
  metaMessageId: string,
  recipientId: string
): Promise<void> {
  const deliveredDelayMs = 1500 + Math.random() * 2000;
  const readDelayMs = deliveredDelayMs + 2000 + Math.random() * 4000;

  await getMockStatusQueue().add(
    "delivered",
    { metaMessageId, status: "delivered", recipientId },
    { delay: deliveredDelayMs, removeOnComplete: true, removeOnFail: true }
  );

  // ~15% of mock messages never get "read" (simulating a recipient who
  // received but didn't open WhatsApp), which keeps the demo data varied.
  if (Math.random() > 0.15) {
    await getMockStatusQueue().add(
      "read",
      { metaMessageId, status: "read", recipientId },
      { delay: readDelayMs, removeOnComplete: true, removeOnFail: true }
    );
  }
}
