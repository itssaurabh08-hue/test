import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog, ipFromHeaders } from "@/lib/audit";

export async function GET(_request: Request, ctx: RouteContext<"/api/contacts/[id]">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      recipients: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { campaign: { select: { id: true, name: true } } },
      },
    },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  return NextResponse.json({ contact });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/contacts/[id]">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  await prisma.contact.delete({ where: { id } });
  await writeAuditLog({
    userId: session.userId,
    action: "CONTACT_DELETED",
    resource: "Contact",
    resourceId: id,
    metadata: { phone: contact.phone, name: contact.name },
    ipAddress: ipFromHeaders(request.headers),
  });

  return NextResponse.json({ deleted: true });
}
