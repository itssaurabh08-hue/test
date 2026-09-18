// Standalone entry point: `pnpm worker` (tsx lib/queue/worker.ts). This
// process actually calls the Meta API (or simulates it in mock mode) —
// nothing sends a WhatsApp message except code running inside this file.
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db/prisma";
import { getEnv, isMockMode } from "@/lib/env";
import { getRedisConnection } from "@/lib/queue/connection";
import {
  MESSAGE_QUEUE_NAME,
  MOCK_STATUS_QUEUE_NAME,
  getMessageQueue,
  scheduleMockStatusProgression,
  type MessageJobData,
  type MockStatusJobData,
} from "@/lib/queue/messageQueue";
import { transitionRecipientStatus, maybeCompleteCampaign } from "@/lib/campaigns/statusTransition";
import { applyMessageStatusUpdate } from "@/lib/campaigns/webhookStatusProcessor";
import { sendTemplateMessage, buildTemplateComponents, TemplatePayloadError } from "@/lib/meta/metaMessages";
import { MetaApiError } from "@/lib/meta/metaClient";
import type { MetaTemplate, MetaTemplateComponent } from "@/lib/meta/metaTemplates";
import type { TemplateVariableInput } from "@/lib/meta/templatePayload";

const PAUSE_RECHECK_DELAY_MS = 15_000;

async function markFailedTerminal(
  recipientId: string,
  campaignId: string,
  fromStatus: "QUEUED" | "SENT",
  error: { code?: number | null; message: string; category: "TRANSIENT" | "PERMANENT" | "UNKNOWN" }
) {
  await transitionRecipientStatus({
    recipientId,
    campaignId,
    from: fromStatus,
    to: "FAILED",
    data: {
      errorCode: error.code?.toString(),
      errorMessage: error.message,
      errorCategory: error.category,
      failedAt: new Date(),
    },
  });
  await maybeCompleteCampaign(campaignId);
}

async function processMessageJob(job: Job<MessageJobData>) {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: job.data.campaignRecipientId },
    include: { campaign: true, contact: true },
  });
  if (!recipient) return; // deleted since being queued — nothing to do

  if (recipient.campaign.status === "CANCELLED") {
    if (recipient.status === "QUEUED" || recipient.status === "PENDING") {
      await transitionRecipientStatus({
        recipientId: recipient.id,
        campaignId: recipient.campaignId,
        from: recipient.status,
        to: "CANCELLED",
      });
    }
    return;
  }

  if (recipient.campaign.status === "PAUSED") {
    // Re-check later rather than consuming a retry attempt or losing the job.
    await getMessageQueue().add(job.name, job.data, {
      delay: PAUSE_RECHECK_DELAY_MS,
      jobId: `${recipient.id}:paused:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return;
  }

  if (!["QUEUED", "PENDING"].includes(recipient.status)) {
    return; // already sent/failed/cancelled by a previous attempt — idempotency guard
  }

  const templateRow = await prisma.template.findUnique({
    where: {
      name_language: {
        name: recipient.campaign.templateName,
        language: recipient.campaign.templateLanguage,
      },
    },
  });
  if (!templateRow || templateRow.status !== "APPROVED") {
    await markFailedTerminal(recipient.id, recipient.campaignId, "QUEUED", {
      message: "Template is no longer approved or has been removed from the WABA.",
      category: "PERMANENT",
    });
    return;
  }

  const template: MetaTemplate = {
    name: templateRow.name,
    language: templateRow.language,
    category: templateRow.category,
    status: templateRow.status,
    components: templateRow.components as unknown as MetaTemplateComponent[],
  };

  const storedVariables = recipient.variables as {
    body?: Record<string, string>;
    headerText?: string | null;
    headerMediaLink?: string | null;
    buttons?: Record<string, string> | null;
  };
  const variableInput: TemplateVariableInput = {
    body: storedVariables.body,
    headerText: storedVariables.headerText ?? undefined,
    headerMediaLink: storedVariables.headerMediaLink ?? undefined,
    buttons: storedVariables.buttons
      ? Object.fromEntries(Object.entries(storedVariables.buttons).map(([k, v]) => [Number(k), v]))
      : undefined,
  };

  let components;
  try {
    components = buildTemplateComponents(template, variableInput);
  } catch (err) {
    const message = err instanceof TemplatePayloadError ? err.message : "Failed to build message payload.";
    await markFailedTerminal(recipient.id, recipient.campaignId, "QUEUED", {
      message,
      category: "PERMANENT",
    });
    return;
  }

  const attemptNumber = (job.attemptsMade ?? 0) + 1;
  const message = await prisma.message.create({
    data: {
      campaignId: recipient.campaignId,
      campaignRecipientId: recipient.id,
      attempt: attemptNumber,
      phone: recipient.phone,
      templateName: recipient.campaign.templateName,
      status: "QUEUED",
      queuedAt: recipient.queuedAt ?? new Date(),
    },
  });

  try {
    const result = await sendTemplateMessage({
      toE164: recipient.phone,
      templateName: recipient.campaign.templateName,
      languageCode: recipient.campaign.templateLanguage,
      components,
    });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        metaMessageId: result.metaMessageId,
        sentAt: new Date(),
        requestPayload: result.requestPayload as never,
        responseRaw: result.responseRaw as never,
      },
    });

    await transitionRecipientStatus({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      from: "QUEUED",
      to: "SENT",
      data: { metaMessageId: result.metaMessageId, sentAt: new Date() },
    });

    if (result.mock) {
      await scheduleMockStatusProgression(result.metaMessageId, recipient.id);
    }
  } catch (err) {
    const metaErr = err instanceof MetaApiError ? err : new MetaApiError({ message: String(err) });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "FAILED",
        errorCode: metaErr.code?.toString(),
        errorType: metaErr.type,
        errorMessage: metaErr.message,
        errorCategory: metaErr.category,
        failedAt: new Date(),
      },
    });

    if (metaErr.category === "PERMANENT") {
      await markFailedTerminal(recipient.id, recipient.campaignId, "QUEUED", metaErr);
      return; // do not rethrow — stop retrying
    }

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        retryCount: { increment: 1 },
        errorCode: metaErr.code?.toString(),
        errorMessage: metaErr.message,
        errorCategory: metaErr.category,
      },
    });
    throw metaErr; // TRANSIENT/UNKNOWN — let BullMQ retry with backoff
  }
}

async function processMockStatusJob(job: Job<MockStatusJobData>) {
  await applyMessageStatusUpdate({
    metaMessageId: job.data.metaMessageId,
    status: job.data.status,
    timestamp: String(Math.floor(Date.now() / 1000)),
    recipientId: "",
    errors:
      job.data.status === "failed"
        ? [{ code: 131026, title: "Message undeliverable", message: "(mock) simulated failure" }]
        : [],
    dedupeKey: `${job.data.metaMessageId}:${job.data.status}:${Date.now()}`,
  });
}

function startWorkers() {
  const env = getEnv();
  const connection = getRedisConnection();

  const messageWorker = new Worker<MessageJobData>(MESSAGE_QUEUE_NAME, processMessageJob, {
    connection,
    concurrency: env.MAX_CONCURRENT_JOBS,
    limiter: { max: env.MAX_MESSAGES_PER_SECOND, duration: 1000 },
  });

  messageWorker.on("failed", async (job, err) => {
    if (!job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts.attempts ?? 1;
    if (attemptsMade < maxAttempts) {
      console.warn(
        `[worker] recipient ${job.data.campaignRecipientId} attempt ${attemptsMade}/${maxAttempts} failed, will retry: ${err.message}`
      );
      return; // BullMQ will retry automatically
    }
    console.error(
      `[worker] recipient ${job.data.campaignRecipientId} exhausted ${maxAttempts} attempts: ${err.message}`
    );
    const recipient = await prisma.campaignRecipient.findUnique({ where: { id: job.data.campaignRecipientId } });
    if (recipient && (recipient.status === "QUEUED" || recipient.status === "PENDING")) {
      await markFailedTerminal(recipient.id, recipient.campaignId, "QUEUED", {
        code: null,
        message: err.message || "Send failed after all retry attempts.",
        category: "TRANSIENT",
      });
    }
  });

  const mockStatusWorker = new Worker<MockStatusJobData>(MOCK_STATUS_QUEUE_NAME, processMockStatusJob, {
    connection,
    concurrency: 10,
  });

  console.log(
    `[worker] started — mode=${isMockMode() ? "MOCK" : "LIVE"}, concurrency=${env.MAX_CONCURRENT_JOBS}, rate=${env.MAX_MESSAGES_PER_SECOND}/s`
  );

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await Promise.all([messageWorker.close(), mockStatusWorker.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startWorkers();
