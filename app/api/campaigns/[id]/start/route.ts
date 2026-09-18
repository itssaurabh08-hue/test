import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { startCampaign, CampaignQueueError } from "@/lib/queue/messageQueue";

export async function POST(_request: Request, ctx: RouteContext<"/api/campaigns/[id]/start">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const result = await startCampaign(id, session.userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CampaignQueueError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to start campaign", err);
    return NextResponse.json({ error: "Failed to start campaign." }, { status: 500 });
  }
}
