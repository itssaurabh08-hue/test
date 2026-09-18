import { normalizePhoneNumber } from "@/lib/validation/phone";

export interface ColumnMapping {
  name: string; // spreadsheet header mapped to "name"
  phone: string; // spreadsheet header mapped to "phone"
  email?: string; // optional spreadsheet header mapped to "email"
}

export interface ImportRowResult {
  rowIndex: number; // 1-based, matches spreadsheet row order (excluding header)
  raw: Record<string, string>;
  name: string;
  phoneRaw: string;
  normalizedPhone: string | null;
  countryCode: string | null;
  email: string | null;
  valid: boolean;
  errors: string[];
  duplicateOfRowIndex: number | null; // set if a duplicate of an earlier row in this file
  existsInDatabase: boolean;
}

export interface ImportValidationSummary {
  rows: ImportRowResult[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateInFileCount: number;
  existingInDatabaseCount: number;
}

export function validateRequiredMapping(mapping: Partial<ColumnMapping>, headers: string[]): string[] {
  const errors: string[] = [];
  if (!mapping.name || !headers.includes(mapping.name)) {
    errors.push("A column must be mapped to \"Name\".");
  }
  if (!mapping.phone || !headers.includes(mapping.phone)) {
    errors.push("A column must be mapped to \"Phone\".");
  }
  if (mapping.email && !headers.includes(mapping.email)) {
    errors.push("The mapped \"Email\" column does not exist in the file.");
  }
  return errors;
}

/**
 * Validates and normalises every row of a parsed spreadsheet.
 * `existingPhones` should be the set of already-imported contact phone
 * numbers (E.164) so we can flag rows that will update an existing
 * contact rather than create a new one.
 */
export function validateImportRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  defaultCountry: string,
  existingPhones: ReadonlySet<string> = new Set()
): ImportValidationSummary {
  const seenPhones = new Map<string, number>(); // normalized phone -> first row index
  const results: ImportRowResult[] = [];

  rows.forEach((raw, i) => {
    const rowIndex = i + 1;
    const name = (raw[mapping.name] ?? "").trim();
    const phoneRaw = (raw[mapping.phone] ?? "").trim();
    const email = mapping.email ? (raw[mapping.email] ?? "").trim() || null : null;

    const errors: string[] = [];
    if (!name) errors.push("Missing name");

    const phoneResult = normalizePhoneNumber(phoneRaw, defaultCountry);
    if (!phoneResult.valid) {
      errors.push(phoneResult.reason === "blank" ? "Missing phone number" : "Invalid phone number");
    }

    let duplicateOfRowIndex: number | null = null;
    if (phoneResult.valid && phoneResult.e164) {
      const firstSeenAt = seenPhones.get(phoneResult.e164);
      if (firstSeenAt !== undefined) {
        duplicateOfRowIndex = firstSeenAt;
        errors.push(`Duplicate of row ${firstSeenAt}`);
      } else {
        seenPhones.set(phoneResult.e164, rowIndex);
      }
    }

    results.push({
      rowIndex,
      raw,
      name,
      phoneRaw,
      normalizedPhone: phoneResult.valid ? phoneResult.e164! : null,
      countryCode: phoneResult.valid ? phoneResult.countryCode ?? defaultCountry : null,
      email,
      valid: errors.length === 0,
      errors,
      duplicateOfRowIndex,
      existsInDatabase: Boolean(
        phoneResult.valid && phoneResult.e164 && existingPhones.has(phoneResult.e164)
      ),
    });
  });

  return {
    rows: results,
    totalRows: results.length,
    validCount: results.filter((r) => r.valid).length,
    invalidCount: results.filter((r) => !r.valid).length,
    duplicateInFileCount: results.filter((r) => r.duplicateOfRowIndex !== null).length,
    existingInDatabaseCount: results.filter((r) => r.existsInDatabase).length,
  };
}
