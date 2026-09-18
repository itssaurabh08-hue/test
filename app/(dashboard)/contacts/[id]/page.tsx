import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ContactDetailPage({
  params,
}: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      recipients: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { campaign: { select: { id: true, name: true } } },
      },
    },
  });
  if (!contact) notFound();

  const metadataEntries = Object.entries((contact.metadata as Record<string, unknown>) ?? {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/contacts" className="text-sm text-muted-foreground hover:underline">
          ← Back to contacts
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{contact.name}</h1>
          {contact.optedOut ? (
            <Badge variant="destructive">Opted out</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {contact.phone} {contact.email ? `· ${contact.email}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Source:</span> {contact.source}
          </p>
          <p>
            <span className="text-muted-foreground">Country:</span> {contact.countryCode}
          </p>
          <p>
            <span className="text-muted-foreground">Imported:</span>{" "}
            {contact.createdAt.toLocaleString()}
          </p>
          {contact.optedOutAt ? (
            <p>
              <span className="text-muted-foreground">Opted out at:</span>{" "}
              {contact.optedOutAt.toLocaleString()}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {metadataEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Imported data</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
            {metadataEntries.map(([key, value]) => (
              <p key={key}>
                <span className="text-muted-foreground">{key}:</span> {String(value)}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campaign history</CardTitle>
        </CardHeader>
        <CardContent>
          {contact.recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This contact has not been part of any campaign yet.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {contact.recipients.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/campaigns/${r.campaign.id}`} className="hover:underline">
                    {r.campaign.name}
                  </Link>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
