// Integration tests against the real Postgres + Redis used in local dev
// (docker compose up -d postgres redis). These call the real BullMQ
// Queue.add, so — same as in normal operation — don't run this suite
// against a Redis instance a live `pnpm worker` is also pointed at
// unless you're fine with it picking up these test jobs (they use mock
// contacts/campaigns and WHATSAPP_MOCK_MODE is expected to be on).
import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { startCampaign, retryFailedRecipients, cancelCampaign, getMessageQueue } from "@/lib/queue/messageQueue";

const prisma = new PrismaClient();

afterAll(async () => {
  await getMessageQueue().close();
  await prisma.$disconnect();
});

async function seedCampaign(recipientCount: number) {
  const user = await prisma.user.create({
    data: { email: `test-${Date.now()}-${Math.random()}@example.com`, name: "Test", passwordHash: "x", role: "MEMBER" },
  });
  const campaign = await prisma.campaign.create({
    data: {
      name: "Queue Lifecycle Test",
      templateName: "hello_world",
      templateLanguage: "en_US",
      status: "DRAFT",
      totalContacts: recipientCount,
      createdById: user.id,
    },
  });
  const recipientIds: string[] = [];
  for (let i = 0; i < recipientCount; i++) {
    const contact = await prisma.contact.create({
      data: { name: "Test", phone: `+9198${Date.now()}${i}`, countryCode: "IN", source: "test" },
    });
    const recipient = await prisma.campaignRecipient.create({
      data: { campaignId: campaign.id, contactId: contact.id, phone: contact.phone, status: "PENDING" },
    });
    recipientIds.push(recipient.id);
  }
  return { user, campaign, recipientIds };
}

async function cleanup(campaignId: string, userId: string, recipientIds: string[]) {
  for (const id of recipientIds) {
    const job = await getMessageQueue().getJob(id);
    await job?.remove().catch(() => {});
  }
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId }, select: { contactId: true } });
  await prisma.campaignRecipient.deleteMany({ where: { campaignId } });
  await prisma.campaign.delete({ where: { id: campaignId } });
  await prisma.contact.deleteMany({ where: { id: { in: recipients.map((r) => r.contactId) } } });
  await prisma.user.delete({ where: { id: userId } });
}

describe("startCampaign", () => {
  it("moves recipients from PENDING to QUEUED and sets the campaign's queued counter", async () => {
    const { user, campaign, recipientIds } = await seedCampaign(3);

    const result = await startCampaign(campaign.id, user.id);
    expect(result.recipientCount).toBe(3);

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
    expect(updated.queued).toBe(3);

    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
    expect(recipients.every((r) => r.status === "QUEUED")).toBe(true);

    await cleanup(campaign.id, user.id, recipientIds);
  });

  it("refuses to start a campaign that is not in DRAFT", async () => {
    const { user, campaign, recipientIds } = await seedCampaign(1);
    await startCampaign(campaign.id, user.id);

    await expect(startCampaign(campaign.id, user.id)).rejects.toThrow();

    await cleanup(campaign.id, user.id, recipientIds);
  });
});

describe("cancelCampaign", () => {
  it("moves all pending/queued recipients to CANCELLED", async () => {
    const { user, campaign, recipientIds } = await seedCampaign(2);
    await startCampaign(campaign.id, user.id);

    await cancelCampaign(campaign.id, user.id);

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.cancelled).toBe(2);
    expect(updated.queued).toBe(0);

    await cleanup(campaign.id, user.id, recipientIds);
  });
});

describe("retryFailedRecipients", () => {
  it("only retries TRANSIENT failures, not PERMANENT ones", async () => {
    const { user, campaign, recipientIds } = await seedCampaign(2);
    await prisma.campaignRecipient.update({
      where: { id: recipientIds[0] },
      data: { status: "FAILED", errorCategory: "TRANSIENT" },
    });
    await prisma.campaignRecipient.update({
      where: { id: recipientIds[1] },
      data: { status: "FAILED", errorCategory: "PERMANENT" },
    });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { failed: 2, status: "COMPLETED" } });

    const result = await retryFailedRecipients(campaign.id, user.id);
    expect(result.retried).toBe(1);

    const transientRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipientIds[0] },
    });
    expect(transientRecipient.status).toBe("QUEUED");

    const permanentRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipientIds[1] },
    });
    expect(permanentRecipient.status).toBe("FAILED"); // untouched

    await cleanup(campaign.id, user.id, recipientIds);
  });
});
