// Actions (start/pause/resume/cancel/retry) are wired up once the queue
// worker exists — see lib/queue/. Until then this just reflects status.
export function CampaignControls({
  status,
}: {
  campaignId: string;
  status: string;
}) {
  if (status === "DRAFT") {
    return <p className="text-sm text-muted-foreground">Draft — not yet queued.</p>;
  }
  return null;
}
