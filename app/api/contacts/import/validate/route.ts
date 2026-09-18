import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/dal";
import { getEnv } from "@/lib/env";
import { validateImportRows, validateRequiredMapping } from "@/lib/contacts/validate";
import { normalizePhoneNumber } from "@/lib/validation/phone";
import { findExistingPhones } from "@/lib/contacts/importService";
import { MAX_IMPORT_ROWS } from "@/lib/contacts/constants";

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).max(MAX_IMPORT_ROWS),
  headers: z.array(z.string()),
  mapping: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
  defaultCountry: z.string().length(2).optional(),
});

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { rows, headers, mapping, defaultCountry } = parsed.data;
  const country = defaultCountry ?? getEnv().DEFAULT_COUNTRY_CODE;

  const mappingErrors = validateRequiredMapping(mapping, headers);
  if (mappingErrors.length > 0) {
    return NextResponse.json({ error: mappingErrors.join(" ") }, { status: 400 });
  }

  // Pre-compute which candidate phones already exist so the preview can
  // flag "will update an existing contact" rows.
  const candidatePhones = rows
    .map((r) => normalizePhoneNumber(r[mapping.phone!], country))
    .filter((r) => r.valid)
    .map((r) => r.e164!);
  const existingPhones = await findExistingPhones([...new Set(candidatePhones)]);

  const summary = validateImportRows(
    rows,
    { name: mapping.name!, phone: mapping.phone!, email: mapping.email },
    country,
    existingPhones
  );

  return NextResponse.json(summary);
}
