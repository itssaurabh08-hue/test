// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { isOptOutKeyword } from "@/lib/suppression/optOutKeywords";
import type { WhatsAppInboundMessage } from "@/lib/meta/webhookParsing";

/** Meta's inbound `from` (wa_id) is a bare international number, e.g. "919876543210". */
function waIdToE164(waId: string): string {
  const digits = waId.replace(/[^\d]/g, "");
  return `+${digits}`;
}

/**
 * Scans inbound WhatsApp messages for a configured opt-out keyword
 * (see lib/suppression/optOutKeywords.ts) and, for each match, records a
 * Suppression row and marks the matching Contact (if one exists yet)
 * opted out. Idempotent: re-processing the same STOP message twice just
 * upserts the same Suppression row.
 */
export async function processInboundMessagesForOptOut(
  messages: WhatsAppInboundMessage[]
): Promise<{ optedOut: number }> {
  let optedOut = 0;

  for (const msg of messages) {
    if (!isOptOutKeyword(msg.text)) continue;
    const phone = waIdToE164(msg.from);

    await prisma.suppression.upsert({
      where: { phone },
      // Re-suppress and clear any prior removal — a contact who opts out
      // again after being manually un-suppressed must not stay eligible.
      update: { removedAt: null, removedById: null },
      create: {
        phone,
        source: "INBOUND_KEYWORD",
        reason: `Inbound message: "${msg.text}"`,
      },
    });

    const contact = await prisma.contact.findUnique({ where: { phone } });
    if (contact && !contact.optedOut) {
      await prisma.contact.update({
        where: { phone },
        data: { optedOut: true, optedOutAt: new Date() },
      });
      await writeAuditLog({
        action: "CONTACT_OPTED_OUT",
        resource: "Contact",
        resourceId: contact.id,
        metadata: { phone, source: "inbound_keyword", keyword: msg.text },
      });
    }
    optedOut++;
  }

  return { optedOut };
}
