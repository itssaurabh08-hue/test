import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { resumeCampaign, CampaignQueueError } from "@/lib/queue/messageQueue";

export async function POST(_request: Request, ctx: RouteContext<"/api/campaigns/[id]/resume">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    await resumeCampaign(id, session.userId);
    return NextResponse.json({ status: "RUNNING" });
  } catch (err) {
    if (err instanceof CampaignQueueError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to resume campaign", err);
    return NextResponse.json({ error: "Failed to resume campaign." }, { status: 500 });
  }
}
