import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
}

export class SpreadsheetParseError extends Error {}

const SUPPORTED_EXCEL_EXTENSIONS = [".xlsx", ".xls"];

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

/** Coerces every cell to a trimmed string so downstream validation is uniform. */
function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = "";
    } else if (value instanceof Date) {
      out[key] = value.toISOString().slice(0, 10);
    } else {
      out[key] = String(value).trim();
    }
  }
  return out;
}

function parseCsv(buffer: Buffer): ParsedSpreadsheet {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    const fatal = result.errors.filter((e) => e.type !== "FieldMismatch");
    if (fatal.length > 0) {
      throw new SpreadsheetParseError(
        `Failed to parse CSV: ${fatal[0].message} (row ${fatal[0].row ?? "?"})`
      );
    }
  }

  const headers = result.meta.fields ?? [];
  if (headers.length === 0) {
    throw new SpreadsheetParseError("No header row detected in CSV file.");
  }

  return { headers, rows: result.data.map(stringifyRow) };
}

function parseExcel(buffer: Buffer): ParsedSpreadsheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new SpreadsheetParseError("Workbook has no sheets.");
  }
  const sheet = workbook.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rawRows.length === 0) {
    throw new SpreadsheetParseError("No data rows found in the first sheet.");
  }

  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    range: 0,
  })[0] as unknown as string[];
  const headers = (headerRow ?? Object.keys(rawRows[0])).map((h) => String(h).trim());

  return { headers, rows: rawRows.map(stringifyRow) };
}

/**
 * Detects file type from the filename extension and parses it into a
 * uniform header + row-object shape. Throws SpreadsheetParseError on
 * malformed input rather than silently producing garbage rows.
 */
export function parseSpreadsheet(buffer: Buffer, filename: string): ParsedSpreadsheet {
  const ext = extensionOf(filename);

  if (ext === ".csv") {
    return parseCsv(buffer);
  }
  if (SUPPORTED_EXCEL_EXTENSIONS.includes(ext)) {
    return parseExcel(buffer);
  }
  throw new SpreadsheetParseError(
    `Unsupported file type "${ext || "unknown"}". Upload a .csv or .xlsx file.`
  );
}
