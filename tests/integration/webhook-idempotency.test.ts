// Integration tests against a real Postgres database (the one configured
// via DATABASE_URL — `docker compose up -d postgres` or a local install).
// These exercise the actual Prisma queries, unlike the rest of the suite
// which is pure-function unit tests.
import "dotenv/config";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { transitionRecipientStatus } from "@/lib/campaigns/statusTransition";
import { applyMessageStatusUpdate } from "@/lib/campaigns/webhookStatusProcessor";

const prisma = new PrismaClient();

async function seedCampaignWithRecipient() {
  const user = await prisma.user.create({
    data: { email: `test-${Date.now()}@example.com`, name: "Test", passwordHash: "x", role: "MEMBER" },
  });
  const contact = await prisma.contact.create({
    data: { name: "Rahul", phone: `+9198${Date.now()}`.slice(0, 13), countryCode: "IN", source: "test" },
  });
  const campaign = await prisma.campaign.create({
    data: {
      name: "Test Campaign",
      templateName: "hello_world",
      templateLanguage: "en_US",
      status: "RUNNING",
      totalContacts: 1,
      queued: 1,
      createdById: user.id,
    },
  });
  const recipient = await prisma.campaignRecipient.create({
    data: { campaignId: campaign.id, contactId: contact.id, phone: contact.phone, status: "QUEUED" },
  });
  return { user, contact, campaign, recipient };
}

async function cleanup(ids: { userId: string; contactId: string; campaignId: string }) {
  await prisma.message.deleteMany({ where: { campaignId: ids.campaignId } });
  await prisma.webhookEvent.deleteMany({ where: { dedupeKey: { startsWith: "wamid.test." } } });
  await prisma.campaignRecipient.deleteMany({ where: { campaignId: ids.campaignId } });
  await prisma.campaign.delete({ where: { id: ids.campaignId } });
  await prisma.contact.delete({ where: { id: ids.contactId } });
  await prisma.user.delete({ where: { id: ids.userId } });
}

describe("transitionRecipientStatus", () => {
  let seed: Awaited<ReturnType<typeof seedCampaignWithRecipient>>;

  beforeEach(async () => {
    seed = await seedCampaignWithRecipient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("moves a recipient from QUEUED to SENT and updates campaign counters", async () => {
    const ok = await transitionRecipientStatus({
      recipientId: seed.recipient.id,
      campaignId: seed.campaign.id,
      from: "QUEUED",
      to: "SENT",
      data: { sentAt: new Date() },
    });
    expect(ok).toBe(true);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: seed.campaign.id } });
    expect(campaign.queued).toBe(0);
    expect(campaign.sent).toBe(1);

    await cleanup({ userId: seed.user.id, contactId: seed.contact.id, campaignId: seed.campaign.id });
  });

  it("is a no-op when the recipient is no longer in the expected `from` status", async () => {
    await transitionRecipientStatus({
      recipientId: seed.recipient.id,
      campaignId: seed.campaign.id,
      from: "QUEUED",
      to: "SENT",
    });
    // Second call still claims `from: QUEUED`, but the recipient is now SENT.
    const ok = await transitionRecipientStatus({
      recipientId: seed.recipient.id,
      campaignId: seed.campaign.id,
      from: "QUEUED",
      to: "SENT",
    });
    expect(ok).toBe(false);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: seed.campaign.id } });
    expect(campaign.sent).toBe(1); // not double-counted

    await cleanup({ userId: seed.user.id, contactId: seed.contact.id, campaignId: seed.campaign.id });
  });
});

describe("applyMessageStatusUpdate — idempotent webhook processing", () => {
  let seed: Awaited<ReturnType<typeof seedCampaignWithRecipient>>;
  let metaMessageId: string;

  beforeEach(async () => {
    seed = await seedCampaignWithRecipient();
    metaMessageId = `wamid.test.${Date.now()}.${Math.random()}`;
    await transitionRecipientStatus({
      recipientId: seed.recipient.id,
      campaignId: seed.campaign.id,
      from: "QUEUED",
      to: "SENT",
      data: { metaMessageId, sentAt: new Date() },
    });
    await prisma.message.create({
      data: {
        campaignId: seed.campaign.id,
        campaignRecipientId: seed.recipient.id,
        phone: seed.recipient.phone,
        templateName: "hello_world",
        status: "SENT",
        metaMessageId,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("applies a delivered event exactly once even if delivered twice (a Meta retry)", async () => {
    const event = {
      metaMessageId,
      status: "delivered",
      timestamp: "1700000000",
      recipientId: seed.contact.phone,
      errors: [],
      dedupeKey: `${metaMessageId}:delivered:1700000000`,
    };

    await applyMessageStatusUpdate(event);
    await applyMessageStatusUpdate(event); // Meta redelivering the same webhook

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: seed.campaign.id } });
    expect(campaign.sent).toBe(0);
    expect(campaign.delivered).toBe(1); // not 2

    const recipient = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: seed.recipient.id } });
    expect(recipient.status).toBe("DELIVERED");

    await cleanup({ userId: seed.user.id, contactId: seed.contact.id, campaignId: seed.campaign.id });
  });

  it("processes delivered then read as forward progress", async () => {
    await applyMessageStatusUpdate({
      metaMessageId,
      status: "delivered",
      timestamp: "1700000001",
      recipientId: seed.contact.phone,
      errors: [],
      dedupeKey: `${metaMessageId}:delivered:1700000001`,
    });
    await applyMessageStatusUpdate({
      metaMessageId,
      status: "read",
      timestamp: "1700000002",
      recipientId: seed.contact.phone,
      errors: [],
      dedupeKey: `${metaMessageId}:read:1700000002`,
    });

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: seed.campaign.id } });
    expect(campaign.delivered).toBe(0);
    expect(campaign.read).toBe(1);

    await cleanup({ userId: seed.user.id, contactId: seed.contact.id, campaignId: seed.campaign.id });
  });

  it("ignores a stale out-of-order event that regresses the status", async () => {
    await applyMessageStatusUpdate({
      metaMessageId,
      status: "read",
      timestamp: "1700000003",
      recipientId: seed.contact.phone,
      errors: [],
      dedupeKey: `${metaMessageId}:read:1700000003`,
    });
    // A "delivered" event arriving late, after we already recorded "read".
    await applyMessageStatusUpdate({
      metaMessageId,
      status: "delivered",
      timestamp: "1700000000", // earlier timestamp, arrived late
      recipientId: seed.contact.phone,
      errors: [],
      dedupeKey: `${metaMessageId}:delivered:1700000000`,
    });

    const recipient = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: seed.recipient.id } });
    expect(recipient.status).toBe("READ"); // did not regress to DELIVERED

    await cleanup({ userId: seed.user.id, contactId: seed.contact.id, campaignId: seed.campaign.id });
  });
});
