import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { syncTemplatesFromMeta } from "@/lib/templates/syncService";
import { MetaApiError } from "@/lib/meta/metaClient";

export async function POST() {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncTemplatesFromMeta(session.userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: err.message, meta: err.toStructured() }, { status: 502 });
    }
    console.error("Template sync failed", err);
    return NextResponse.json({ error: "Template sync failed." }, { status: 500 });
  }
}
