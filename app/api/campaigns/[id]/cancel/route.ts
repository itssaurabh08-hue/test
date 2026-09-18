import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { cancelCampaign, CampaignQueueError } from "@/lib/queue/messageQueue";

export async function POST(_request: Request, ctx: RouteContext<"/api/campaigns/[id]/cancel">) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    await cancelCampaign(id, session.userId);
    return NextResponse.json({ status: "CANCELLED" });
  } catch (err) {
    if (err instanceof CampaignQueueError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to cancel campaign", err);
    return NextResponse.json({ error: "Failed to cancel campaign." }, { status: 500 });
  }
}
