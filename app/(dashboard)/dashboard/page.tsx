import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDistributionChart } from "@/components/charts/status-distribution-chart";
import { RecentCampaignsChart } from "@/components/charts/recent-campaigns-chart";

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "outline"> = {
  DRAFT: "outline",
  QUEUED: "secondary",
  RUNNING: "default",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "outline",
  FAILED: "destructive",
};

export default async function DashboardPage() {
  const [totalCampaigns, aggregates, recentCampaigns] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.aggregate({
      _sum: { sent: true, delivered: true, read: true, failed: true },
    }),
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        status: true,
        totalContacts: true,
        sent: true,
        delivered: true,
        read: true,
        failed: true,
        createdAt: true,
      },
    }),
  ]);

  const sent = aggregates._sum.sent ?? 0;
  const delivered = aggregates._sum.delivered ?? 0;
  const read = aggregates._sum.read ?? 0;
  const failed = aggregates._sum.failed ?? 0;
  // "Sent" counts messages currently sitting in the SENT bucket (not yet
  // delivered/read/failed); the denominator for rates is everything Meta
  // has ever accepted a delivery/read/fail outcome for.
  const totalProcessed = sent + delivered + read + failed;

  const kpis = [
    { label: "Total campaigns", value: totalCampaigns },
    { label: "Messages sent", value: totalProcessed },
    { label: "Delivery rate", value: pct(delivered + read, totalProcessed), isRate: true },
    { label: "Read rate", value: pct(read, totalProcessed), isRate: true },
    { label: "Failure rate", value: pct(failed, totalProcessed), isRate: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your WhatsApp bulk messaging activity.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {typeof k.value === "number" ? k.value.toLocaleString() : k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Messages by status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDistributionChart data={{ sent, delivered, read, failed }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages sent — recent campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCampaignsChart
              data={recentCampaigns.map((c) => ({ name: c.name, sent: c.sent + c.delivered + c.read + c.failed }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCampaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaigns yet. Create your first campaign from the Campaigns page.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {recentCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between py-3 text-sm hover:bg-accent/30"
                >
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>{c.status}</Badge>{" "}
                      {c.totalContacts} recipients
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{c.delivered + c.read} delivered</p>
                    <p>{c.failed} failed</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
