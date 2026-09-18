// No `server-only` guard — see the comment in lib/db/prisma.ts.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { listWabaTemplates } from "@/lib/meta/metaTemplates";
import { writeAuditLog } from "@/lib/audit";

export interface SyncTemplatesResult {
  synced: number;
  removed: number;
}

/**
 * Pulls the current template list from Meta (or the mock set, in
 * WHATSAPP_MOCK_MODE) and mirrors it into the Template table: upserts
 * everything Meta currently returns, and removes any template rows that
 * Meta no longer returns (e.g. deleted in Business Manager). Campaigns
 * store their template name/language as plain strings, not a foreign
 * key, so removing a stale Template row never affects past campaigns.
 */
export async function syncTemplatesFromMeta(userId: string): Promise<SyncTemplatesResult> {
  const templates = await listWabaTemplates();

  for (const t of templates) {
    await prisma.template.upsert({
      where: { name_language: { name: t.name, language: t.language } },
      create: {
        metaTemplateId: t.id ?? null,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components as unknown as Prisma.InputJsonValue,
      },
      update: {
        metaTemplateId: t.id ?? null,
        category: t.category,
        status: t.status,
        components: t.components as unknown as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
    });
  }

  const currentKeys = new Set(templates.map((t) => `${t.name}::${t.language}`));
  const existing = await prisma.template.findMany({ select: { id: true, name: true, language: true } });
  const staleIds = existing
    .filter((row) => !currentKeys.has(`${row.name}::${row.language}`))
    .map((row) => row.id);

  if (staleIds.length > 0) {
    await prisma.template.deleteMany({ where: { id: { in: staleIds } } });
  }

  await writeAuditLog({
    userId,
    action: "TEMPLATE_SYNCED",
    resource: "Template",
    metadata: { synced: templates.length, removed: staleIds.length },
  });

  return { synced: templates.length, removed: staleIds.length };
}
