import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/campaigns/[id]/export">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "asc" },
    include: { contact: { select: { name: true } } },
  });

  const header = [
    "Name",
    "Phone",
    "Status",
    "Meta Message ID",
    "Error",
    "Queued At",
    "Sent At",
    "Delivered At",
    "Read At",
    "Failed At",
  ];
  const rows = recipients.map((r) =>
    [
      r.contact.name,
      r.phone,
      r.status,
      r.metaMessageId ?? "",
      r.errorMessage ?? "",
      r.queuedAt?.toISOString() ?? "",
      r.sentAt?.toISOString() ?? "",
      r.deliveredAt?.toISOString() ?? "",
      r.readAt?.toISOString() ?? "",
      r.failedAt?.toISOString() ?? "",
    ].map(csvEscape)
  );

  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const filename = `${campaign.name.replace(/[^a-z0-9]+/gi, "_")}-results.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
