import { describe, it, expect } from "vitest";
import { isOptOutKeyword } from "@/lib/suppression/optOutKeywords";

describe("isOptOutKeyword", () => {
  it("matches configured keywords case-insensitively", () => {
    expect(isOptOutKeyword("stop")).toBe(true);
    expect(isOptOutKeyword("STOP")).toBe(true);
    expect(isOptOutKeyword("Unsubscribe")).toBe(true);
    expect(isOptOutKeyword("opt out")).toBe(true);
    expect(isOptOutKeyword("Remove")).toBe(true);
    expect(isOptOutKeyword("cancel")).toBe(true);
  });

  it("tolerates surrounding whitespace and trailing punctuation", () => {
    expect(isOptOutKeyword("  STOP  ")).toBe(true);
    expect(isOptOutKeyword("Stop.")).toBe(true);
    expect(isOptOutKeyword("Stop!")).toBe(true);
  });

  it("does NOT treat an arbitrary message containing a keyword as an opt-out", () => {
    expect(isOptOutKeyword("please stop the bus is late")).toBe(false);
    expect(isOptOutKeyword("can you cancel my order")).toBe(false);
    expect(isOptOutKeyword("Sports Day is amazing!")).toBe(false);
  });

  it("returns false for empty or missing text", () => {
    expect(isOptOutKeyword("")).toBe(false);
    expect(isOptOutKeyword(null)).toBe(false);
    expect(isOptOutKeyword(undefined)).toBe(false);
  });
});
