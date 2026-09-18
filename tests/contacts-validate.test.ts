import { describe, it, expect } from "vitest";
import { validateImportRows, validateRequiredMapping } from "@/lib/contacts/validate";

const mapping = { name: "Name", phone: "Mobile" };

describe("validateRequiredMapping", () => {
  it("requires name and phone to be mapped to real headers", () => {
    const errors = validateRequiredMapping({}, ["Name", "Mobile"]);
    expect(errors).toHaveLength(2);
  });

  it("passes when name and phone are mapped", () => {
    const errors = validateRequiredMapping(mapping, ["Name", "Mobile"]);
    expect(errors).toHaveLength(0);
  });
});

describe("validateImportRows", () => {
  it("flags missing name and invalid phone", () => {
    const rows = [
      { Name: "", Mobile: "9876543210" },
      { Name: "Priya", Mobile: "123" },
    ];
    const summary = validateImportRows(rows, mapping, "IN");
    expect(summary.rows[0].errors).toContain("Missing name");
    expect(summary.rows[1].errors).toContain("Invalid phone number");
    expect(summary.validCount).toBe(0);
    expect(summary.invalidCount).toBe(2);
  });

  it("detects duplicate phone numbers within the same file", () => {
    const rows = [
      { Name: "Rahul", Mobile: "9876543210" },
      { Name: "Rahul Sharma", Mobile: "+91 98765 43210" }, // same number, different formatting
    ];
    const summary = validateImportRows(rows, mapping, "IN");
    expect(summary.rows[0].valid).toBe(true);
    expect(summary.rows[1].valid).toBe(false);
    expect(summary.rows[1].duplicateOfRowIndex).toBe(1);
    expect(summary.duplicateInFileCount).toBe(1);
  });

  it("flags rows whose number already exists in the database", () => {
    const rows = [{ Name: "Rahul", Mobile: "9876543210" }];
    const summary = validateImportRows(rows, mapping, "IN", new Set(["+919876543210"]));
    expect(summary.rows[0].existsInDatabase).toBe(true);
    expect(summary.existingInDatabaseCount).toBe(1);
  });

  it("normalises valid rows to E.164", () => {
    const rows = [{ Name: "Rahul", Mobile: "9876543210" }];
    const summary = validateImportRows(rows, mapping, "IN");
    expect(summary.rows[0].normalizedPhone).toBe("+919876543210");
    expect(summary.validCount).toBe(1);
  });

  it("preserves the original raw row data", () => {
    const rows = [{ Name: "Rahul", Mobile: "9876543210", Grade: "Grade 6" }];
    const summary = validateImportRows(rows, mapping, "IN");
    expect(summary.rows[0].raw.Grade).toBe("Grade 6");
  });
});
