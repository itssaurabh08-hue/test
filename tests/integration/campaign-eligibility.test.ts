import "dotenv/config";
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getEligibleContacts } from "@/lib/campaigns/campaignService";

const prisma = new PrismaClient();
const createdContactIds: string[] = [];

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeContact(phone: string, optedOut: boolean) {
  const c = await prisma.contact.create({
    data: { name: "Test", phone, countryCode: "IN", source: "test", optedOut },
  });
  createdContactIds.push(c.id);
  return c;
}

afterEach(async () => {
  await prisma.contact.deleteMany({ where: { id: { in: createdContactIds } } });
  createdContactIds.length = 0;
});

describe("getEligibleContacts — opt-out filtering", () => {
  it("excludes opted-out contacts when selecting 'all'", async () => {
    const active = await makeContact(`+9198${Date.now()}1`, false);
    const optedOut = await makeContact(`+9198${Date.now()}2`, true);

    const result = await getEligibleContacts({ type: "all" });
    const eligibleIds = result.eligible.map((c) => c.id);

    expect(eligibleIds).toContain(active.id);
    expect(eligibleIds).not.toContain(optedOut.id);
  });

  it("excludes an explicitly-selected opted-out contact from a 'specific' selection", async () => {
    const active = await makeContact(`+9198${Date.now()}3`, false);
    const optedOut = await makeContact(`+9198${Date.now()}4`, true);

    const result = await getEligibleContacts({
      type: "specific",
      contactIds: [active.id, optedOut.id],
    });

    expect(result.totalSelected).toBe(2);
    expect(result.optedOutExcluded).toBe(1);
    expect(result.eligible.map((c) => c.id)).toEqual([active.id]);
  });
});
