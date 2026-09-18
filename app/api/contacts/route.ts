import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const optedOutFilter = url.searchParams.get("optedOut"); // "true" | "false" | null (any)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

  const where: Prisma.ContactWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }
  if (optedOutFilter === "true") where.optedOut = true;
  if (optedOutFilter === "false") where.optedOut = false;

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, phone: true, email: true, optedOut: true, source: true, metadata: true, createdAt: true },
  });

  const [total, optedOutCount] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { optedOut: true } }),
  ]);

  return NextResponse.json({ contacts, total, optedOutCount });
}
