import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/dal";
import { getEnv } from "@/lib/env";
import { parseSpreadsheet, SpreadsheetParseError } from "@/lib/contacts/parse";
import { suggestColumnMapping } from "@/lib/contacts/columnMapping";
import { MAX_IMPORT_ROWS } from "@/lib/contacts/constants";

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getEnv();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const maxBytes = env.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File is too large. Maximum size is ${env.MAX_UPLOAD_FILE_SIZE_MB}MB.` },
      { status: 413 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { headers, rows } = parseSpreadsheet(buffer, file.name);

    if (rows.length === 0) {
      return NextResponse.json({ error: "File has no data rows." }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `File has ${rows.length} rows, which exceeds the ${MAX_IMPORT_ROWS} row limit per import.` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      filename: file.name,
      headers,
      rows,
      totalRows: rows.length,
      suggestedMapping: suggestColumnMapping(headers),
      defaultCountryCode: env.DEFAULT_COUNTRY_CODE,
    });
  } catch (err) {
    if (err instanceof SpreadsheetParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to parse import file", err);
    return NextResponse.json({ error: "Failed to parse file." }, { status: 500 });
  }
}
