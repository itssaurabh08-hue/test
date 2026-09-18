// No `server-only` guard — see the comment in lib/db/prisma.ts.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { ImportRowResult } from "@/lib/contacts/validate";

/** Looks up which of the given normalised phone numbers already exist. */
export async function findExistingPhones(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const existing = await prisma.contact.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
  });
  return new Set(existing.map((c) => c.phone));
}

export interface CommitImportResult {
  created: number;
  updated: number;
  skippedInvalid: number;
  skippedDuplicateInFile: number;
}

interface CommitImportOptions {
  rows: ImportRowResult[];
  source: string;
  userId: string;
  ipAddress?: string | null;
}

/**
 * Persists validated import rows. Rows that fail validation or are
 * duplicates within the file are skipped (the caller should have already
 * surfaced those to the user during preview). Existing contacts are
 * updated (name/email/metadata/source) but their opt-out status is never
 * touched by a re-import.
 */
export async function commitImportedContacts(
  options: CommitImportOptions
): Promise<CommitImportResult> {
  const { rows, source, userId, ipAddress } = options;
  const importable = rows.filter((r) => r.valid && r.normalizedPhone);

  // Determine create vs. update counts up front — upsert()'s return value
  // doesn't reliably distinguish the two (createdAt/updatedAt can be set
  // by different code paths and aren't safe to diff for this purpose).
  const existingPhones = await findExistingPhones(
    importable.map((r) => r.normalizedPhone!)
  );
  const updated = importable.filter((r) => existingPhones.has(r.normalizedPhone!)).length;
  const created = importable.length - updated;

  // A phone that opted out (via inbound "STOP" etc.) before ever having a
  // Contact row must still come in pre-suppressed — otherwise re-importing
  // the same spreadsheet later would silently resurrect them.
  const suppressed = await prisma.suppression.findMany({
    where: { phone: { in: importable.map((r) => r.normalizedPhone!) }, removedAt: null },
    select: { phone: true },
  });
  const suppressedPhones = new Set(suppressed.map((s) => s.phone));

  await mapWithConcurrency(importable, 10, async (row) => {
    const metadata = row.raw as Prisma.InputJsonValue;
    const isPreSuppressed = suppressedPhones.has(row.normalizedPhone!);
    await prisma.contact.upsert({
      where: { phone: row.normalizedPhone! },
      create: {
        name: row.name,
        phone: row.normalizedPhone!,
        countryCode: row.countryCode ?? "IN",
        email: row.email,
        source,
        metadata,
        optedOut: isPreSuppressed,
        optedOutAt: isPreSuppressed ? new Date() : null,
      },
      update: {
        name: row.name,
        email: row.email,
        source,
        metadata,
        // optedOut / optedOutAt intentionally omitted on update: re-
        // importing a contact must never silently re-subscribe them.
      },
    });
  });

  await writeAuditLog({
    userId,
    action: "CONTACT_IMPORTED",
    resource: "Contact",
    metadata: {
      source,
      created,
      updated,
      skippedInvalid: rows.length - importable.length,
      totalRows: rows.length,
    },
    ipAddress,
  });

  return {
    created,
    updated,
    skippedInvalid: rows.filter((r) => !r.valid && r.duplicateOfRowIndex === null).length,
    skippedDuplicateInFile: rows.filter((r) => r.duplicateOfRowIndex !== null).length,
  };
}
