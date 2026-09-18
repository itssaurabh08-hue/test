import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { ContactsTable } from "./contacts-table";

export default async function ContactsPage() {
  const [total, optedOutCount] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { optedOut: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">Search, filter, and manage your contact list.</p>
        </div>
        <Button asChild>
          <Link href="/contacts/import">Import contacts</Link>
        </Button>
      </div>

      <ContactsTable initialTotal={total} initialOptedOut={optedOutCount} />
    </div>
  );
}
