import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseSpreadsheet, SpreadsheetParseError } from "@/lib/contacts/parse";

describe("parseSpreadsheet (CSV)", () => {
  it("detects headers and parses rows", () => {
    const csv = "Name,Mobile,Grade,Event,Parent Type\nRahul Sharma,9876543210,Grade 6,Sports Day,Parent\nPriya Mehta,9812345678,Grade 8,Sports Day,Parent\n";
    const result = parseSpreadsheet(Buffer.from(csv), "contacts.csv");
    expect(result.headers).toEqual(["Name", "Mobile", "Grade", "Event", "Parent Type"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].Name).toBe("Rahul Sharma");
    expect(result.rows[0].Mobile).toBe("9876543210");
  });

  it("throws on a CSV with no header row", () => {
    expect(() => parseSpreadsheet(Buffer.from(""), "empty.csv")).toThrow(SpreadsheetParseError);
  });

  it("rejects unsupported file types", () => {
    expect(() => parseSpreadsheet(Buffer.from("hello"), "contacts.pdf")).toThrow(
      SpreadsheetParseError
    );
  });
});

describe("parseSpreadsheet (XLSX)", () => {
  it("detects headers and parses rows from a workbook", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Mobile", "Grade"],
      ["Rahul Sharma", "9876543210", "Grade 6"],
      ["Priya Mehta", "9812345678", "Grade 8"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = parseSpreadsheet(buffer, "contacts.xlsx");
    expect(result.headers).toEqual(["Name", "Mobile", "Grade"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].Name).toBe("Priya Mehta");
  });
});
