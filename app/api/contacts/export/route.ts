import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contacts = await prisma.contact.findMany({ orderBy: { createdAt: "desc" } });

  const header = ["Name", "Phone", "Email", "Source", "Opted Out", "Opted Out At", "Created At"];
  const rows = contacts.map((c) =>
    [
      c.name,
      c.phone,
      c.email ?? "",
      c.source,
      c.optedOut ? "yes" : "no",
      c.optedOutAt?.toISOString() ?? "",
      c.createdAt.toISOString(),
    ].map(csvEscape)
  );

  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-export.csv"`,
    },
  });
}
