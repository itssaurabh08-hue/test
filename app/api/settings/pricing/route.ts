import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rates = await prisma.pricingRate.findMany({ orderBy: [{ country: "asc" }, { category: "asc" }] });
  return NextResponse.json({ rates });
}

const bodySchema = z.object({
  country: z.string().length(2).toUpperCase(),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION", "SERVICE"]),
  price: z.number().min(0),
  currency: z.string().min(1).max(8).default("USD"),
});

export async function PUT(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can update pricing." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { country, category, price, currency } = parsed.data;

  const rate = await prisma.pricingRate.upsert({
    where: { country_category: { country, category } },
    update: { price, currency },
    create: { country, category, price, currency },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "PRICING_UPDATED",
    resource: "PricingRate",
    resourceId: rate.id,
    metadata: { country, category, price, currency },
  });

  return NextResponse.json({ rate });
}
