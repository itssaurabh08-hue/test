import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog, ipFromHeaders } from "@/lib/audit";

/**
 * Removing a number from the suppression list is a deliberate,
 * explicitly-authorised action (per the project brief) — it re-enables
 * that contact for future campaigns, so it's a soft delete (removedAt/
 * removedById kept for audit) rather than a silent row delete, and it's
 * always paired with an audit log entry.
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/suppressions/[id]">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const suppression = await prisma.suppression.findUnique({ where: { id } });
  if (!suppression) {
    return NextResponse.json({ error: "Suppression record not found." }, { status: 404 });
  }
  if (suppression.removedAt) {
    return NextResponse.json({ error: "Already removed from the suppression list." }, { status: 400 });
  }

  await prisma.suppression.update({
    where: { id },
    data: { removedAt: new Date(), removedById: session.userId },
  });

  const contact = await prisma.contact.findUnique({ where: { phone: suppression.phone } });
  if (contact?.optedOut) {
    await prisma.contact.update({
      where: { phone: suppression.phone },
      data: { optedOut: false, optedOutAt: null },
    });
  }

  await writeAuditLog({
    userId: session.userId,
    action: "SUPPRESSION_REMOVED",
    resource: "Suppression",
    resourceId: id,
    metadata: { phone: suppression.phone },
    ipAddress: ipFromHeaders(request.headers),
  });

  return NextResponse.json({ removed: true });
}
