import type { ColumnMapping } from "@/lib/contacts/validate";

const NAME_HINTS = /^(name|full ?name|contact ?name|student ?name)$/i;
const PHONE_HINTS = /^(phone|mobile|mobile ?number|phone ?number|contact|whatsapp|cell)$/i;
const EMAIL_HINTS = /^(email|e-?mail|email ?address)$/i;

/** Best-effort auto-detection of column mapping from header names, editable by the user afterwards. */
export function suggestColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const suggestion: Partial<ColumnMapping> = {};
  for (const header of headers) {
    if (!suggestion.name && NAME_HINTS.test(header)) suggestion.name = header;
    if (!suggestion.phone && PHONE_HINTS.test(header)) suggestion.phone = header;
    if (!suggestion.email && EMAIL_HINTS.test(header)) suggestion.email = header;
  }
  return suggestion;
}
