import { describe, it, expect } from "vitest";
import { normalizePhoneNumber } from "@/lib/validation/phone";

describe("normalizePhoneNumber (default country IN)", () => {
  it("normalises a bare 10-digit mobile number", () => {
    const r = normalizePhoneNumber("9876543210");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+919876543210");
  });

  it("accepts an already-E.164 number", () => {
    const r = normalizePhoneNumber("+919876543210");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+919876543210");
  });

  it("normalises a number with country code but no plus", () => {
    const r = normalizePhoneNumber("919876543210");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+919876543210");
  });

  it("strips formatting characters (spaces, dashes, parens)", () => {
    const r = normalizePhoneNumber("+91 98765-43210");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+919876543210");
  });

  it("handles the 00 international prefix", () => {
    const r = normalizePhoneNumber("00919876543210");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+919876543210");
  });

  it("strips an accidental leading trunk zero", () => {
    const r = normalizePhoneNumber("09876543210");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+919876543210");
  });

  it("rejects a blank number", () => {
    const r = normalizePhoneNumber("");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("blank");
  });

  it("rejects a number that is too short", () => {
    const r = normalizePhoneNumber("12345");
    expect(r.valid).toBe(false);
  });

  it("does NOT blindly prepend +91 to an invalid-looking landline-style number", () => {
    // Indian mobile numbers must start with 6-9; this starts with 5.
    const r = normalizePhoneNumber("5876543210");
    expect(r.valid).toBe(false);
  });

  it("rejects a number with too many digits", () => {
    const r = normalizePhoneNumber("9876543210123456789");
    expect(r.valid).toBe(false);
  });

  it("accepts a well-formed non-default-country E.164 number as-is", () => {
    const r = normalizePhoneNumber("+12025550123");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+12025550123");
  });
});

describe("normalizePhoneNumber (configurable default country)", () => {
  it("normalises a US number when default country is US", () => {
    const r = normalizePhoneNumber("2025550123", "US");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+12025550123");
  });

  it("rejects an unsupported default country", () => {
    const r = normalizePhoneNumber("9876543210", "ZZ");
    expect(r.valid).toBe(false);
  });
});
