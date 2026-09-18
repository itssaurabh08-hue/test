import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

  const contacts = await prisma.contact.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, phone: true, optedOut: true, source: true, metadata: true },
  });

  const [total, optedOutCount] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { optedOut: true } }),
  ]);

  return NextResponse.json({ contacts, total, optedOutCount });
}
