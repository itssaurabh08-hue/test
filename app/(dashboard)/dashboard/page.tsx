import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function rate(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default async function DashboardPage() {
  const [totalCampaigns, aggregates, recentCampaigns] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.aggregate({
      _sum: { sent: true, delivered: true, read: true, failed: true },
    }),
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
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

  const stats = [
    { label: "Total campaigns", value: totalCampaigns },
    { label: "Messages sent", value: sent },
    { label: "Delivered", value: delivered, sub: rate(delivered, sent) + " delivery rate" },
    { label: "Read", value: read, sub: rate(read, delivered) + " read rate" },
    { label: "Failed", value: failed, sub: rate(failed, sent) + " failure rate" },
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
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{s.value.toLocaleString()}</p>
              {s.sub ? <p className="text-xs text-muted-foreground">{s.sub}</p> : null}
            </CardContent>
          </Card>
        ))}
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
                <div key={c.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.status} · {c.totalContacts} recipients
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{c.sent} sent</p>
                    <p>{c.delivered} delivered</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
