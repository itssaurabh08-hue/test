import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { normalizePhoneNumber } from "@/lib/validation/phone";
import { getEnv } from "@/lib/env";
import { writeAuditLog, ipFromHeaders } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const includeRemoved = url.searchParams.get("includeRemoved") === "true";

  const suppressions = await prisma.suppression.findMany({
    where: {
      ...(includeRemoved ? {} : { removedAt: null }),
      ...(search ? { phone: { contains: search } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { createdBy: { select: { name: true } } },
  });

  const activeCount = await prisma.suppression.count({ where: { removedAt: null } });

  return NextResponse.json({ suppressions, activeCount });
}

const bodySchema = z.object({
  phone: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const phoneResult = normalizePhoneNumber(parsed.data.phone, getEnv().DEFAULT_COUNTRY_CODE);
  if (!phoneResult.valid || !phoneResult.e164) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }
  const phone = phoneResult.e164;

  await prisma.suppression.upsert({
    where: { phone },
    update: { removedAt: null, removedById: null, reason: parsed.data.reason },
    create: {
      phone,
      source: "MANUAL",
      reason: parsed.data.reason ?? "Manually added to suppression list.",
      createdById: session.userId,
    },
  });

  const contact = await prisma.contact.findUnique({ where: { phone } });
  if (contact && !contact.optedOut) {
    await prisma.contact.update({
      where: { phone },
      data: { optedOut: true, optedOutAt: new Date() },
    });
  }

  await writeAuditLog({
    userId: session.userId,
    action: "SUPPRESSION_ADDED",
    resource: "Suppression",
    metadata: { phone, reason: parsed.data.reason },
    ipAddress: ipFromHeaders(request.headers),
  });

  return NextResponse.json({ phone });
}
