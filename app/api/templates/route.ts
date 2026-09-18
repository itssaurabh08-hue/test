import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const approvedOnly = url.searchParams.get("approvedOnly") !== "false";

  const templates = await prisma.template.findMany({
    where: approvedOnly ? { status: "APPROVED" } : undefined,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ templates });
}
