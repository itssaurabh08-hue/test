import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function ContactsPage() {
  const [contacts, total, optedOutCount] = await Promise.all([
    prisma.contact.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.contact.count(),
    prisma.contact.count({ where: { optedOut: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {total} total · {optedOutCount} opted out
          </p>
        </div>
        <Button asChild>
          <Link href="/contacts/import">Import contacts</Link>
        </Button>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No contacts yet. Import a CSV or XLSX file to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.phone}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.source}</td>
                  <td className="px-4 py-2.5">
                    {c.optedOut ? (
                      <Badge variant="destructive">Opted out</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
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
