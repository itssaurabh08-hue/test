import { NextResponse } from "next/server";
import type { Prisma, RecipientStatus } from "@prisma/client";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";

const VALID_STATUSES = new Set([
  "PENDING",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "CANCELLED",
]);

export async function GET(request: Request, ctx: RouteContext<"/api/campaigns/[id]/recipients">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search")?.trim();
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const where: Prisma.CampaignRecipientWhereInput = { campaignId: id };
  if (status && VALID_STATUSES.has(status)) {
    where.status = status as RecipientStatus;
  }
  if (search) {
    where.OR = [
      { phone: { contains: search } },
      { contact: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const recipients = await prisma.campaignRecipient.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { contact: { select: { name: true } } },
  });

  const hasMore = recipients.length > limit;
  const page = hasMore ? recipients.slice(0, limit) : recipients;

  return NextResponse.json({
    recipients: page.map((r) => ({
      id: r.id,
      name: r.contact.name,
      phone: r.phone,
      status: r.status,
      metaMessageId: r.metaMessageId,
      errorMessage: r.errorMessage,
      errorCategory: r.errorCategory,
      retryCount: r.retryCount,
      queuedAt: r.queuedAt,
      sentAt: r.sentAt,
      deliveredAt: r.deliveredAt,
      readAt: r.readAt,
      failedAt: r.failedAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
