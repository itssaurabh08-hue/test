import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecipientsTable } from "./recipients-table";
import { CampaignControls } from "./campaign-controls";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "outline"> = {
  DRAFT: "outline",
  QUEUED: "secondary",
  RUNNING: "default",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "outline",
  FAILED: "destructive",
};

export default async function CampaignDetailPage({
  params,
}: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const processed = campaign.sent + campaign.delivered + campaign.read + campaign.failed + campaign.cancelled;
  const progressPct = campaign.totalContacts > 0 ? Math.round((processed / campaign.totalContacts) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{campaign.name}</h1>
            <Badge variant={STATUS_VARIANT[campaign.status] ?? "outline"}>{campaign.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {campaign.templateName} ({campaign.templateLanguage}) · created{" "}
            {campaign.createdAt.toLocaleString()}
          </p>
        </div>
        <CampaignControls campaignId={campaign.id} status={campaign.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {processed.toLocaleString()} / {campaign.totalContacts.toLocaleString()} processed
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Total" value={campaign.totalContacts} />
            <Stat label="Queued" value={campaign.queued} />
            <Stat label="Sent" value={campaign.sent} />
            <Stat label="Delivered" value={campaign.delivered} />
            <Stat label="Read" value={campaign.read} />
            <Stat label="Failed" value={campaign.failed} />
          </div>
          {campaign.estimatedCostAmount ? (
            <p className="text-xs text-muted-foreground">
              Estimated cost: {Number(campaign.estimatedCostAmount).toFixed(2)}{" "}
              {campaign.estimatedCostCurrency} (illustrative estimate, not the actual Meta invoice)
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recipients</CardTitle>
          <a
            href={`/api/campaigns/${campaign.id}/export`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Export CSV
          </a>
        </CardHeader>
        <CardContent>
          <RecipientsTable campaignId={campaign.id} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
