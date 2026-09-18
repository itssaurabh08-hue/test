import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog, ipFromHeaders } from "@/lib/audit";

export async function POST(request: Request, ctx: RouteContext<"/api/contacts/[id]/opt-out">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }
  if (contact.optedOut) {
    return NextResponse.json({ error: "Contact is already opted out." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.contact.update({
      where: { id },
      data: { optedOut: true, optedOutAt: new Date() },
    }),
    prisma.suppression.upsert({
      where: { phone: contact.phone },
      update: { removedAt: null, removedById: null },
      create: {
        phone: contact.phone,
        source: "MANUAL",
        reason: "Marked opted out manually from the Contacts page.",
        createdById: session.userId,
      },
    }),
  ]);

  await writeAuditLog({
    userId: session.userId,
    action: "CONTACT_OPTED_OUT",
    resource: "Contact",
    resourceId: id,
    metadata: { phone: contact.phone, source: "manual" },
    ipAddress: ipFromHeaders(request.headers),
  });

  return NextResponse.json({ optedOut: true });
}
