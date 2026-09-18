import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "outline"> = {
  DRAFT: "outline",
  QUEUED: "secondary",
  RUNNING: "default",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "outline",
  FAILED: "destructive",
};

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      templateName: true,
      totalContacts: true,
      sent: true,
      delivered: true,
      failed: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Create and monitor bulk messaging campaigns.</p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">New campaign</Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaigns yet. Start by uploading contacts and selecting a template.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Recipients</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Delivered</th>
                <th className="px-4 py-2 font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.templateName}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">{c.totalContacts}</td>
                  <td className="px-4 py-2.5">{c.sent}</td>
                  <td className="px-4 py-2.5">{c.delivered}</td>
                  <td className="px-4 py-2.5">{c.failed}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {c.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
