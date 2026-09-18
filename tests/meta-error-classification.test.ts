import { describe, it, expect } from "vitest";
import { classifyMetaErrorCode, classifyTransportError } from "@/lib/meta/errorClassification";

describe("classifyMetaErrorCode", () => {
  it("classifies rate limit codes as TRANSIENT", () => {
    expect(classifyMetaErrorCode(4)).toBe("TRANSIENT");
    expect(classifyMetaErrorCode(80007)).toBe("TRANSIENT");
    expect(classifyMetaErrorCode(131048)).toBe("TRANSIENT");
  });

  it("classifies invalid recipient / template errors as PERMANENT", () => {
    expect(classifyMetaErrorCode(131026)).toBe("PERMANENT"); // undeliverable
    expect(classifyMetaErrorCode(132001)).toBe("PERMANENT"); // template doesn't exist
    expect(classifyMetaErrorCode(100)).toBe("PERMANENT"); // invalid parameter
  });

  it("returns UNKNOWN for an unmapped code", () => {
    expect(classifyMetaErrorCode(999999)).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when no code is given", () => {
    expect(classifyMetaErrorCode(undefined)).toBe("UNKNOWN");
  });
});

describe("classifyTransportError", () => {
  it("treats network failures (no status) as TRANSIENT", () => {
    expect(classifyTransportError(undefined)).toBe("TRANSIENT");
  });

  it("treats 429 and 5xx as TRANSIENT", () => {
    expect(classifyTransportError(429)).toBe("TRANSIENT");
    expect(classifyTransportError(500)).toBe("TRANSIENT");
    expect(classifyTransportError(503)).toBe("TRANSIENT");
  });

  it("treats other 4xx as PERMANENT", () => {
    expect(classifyTransportError(400)).toBe("PERMANENT");
    expect(classifyTransportError(404)).toBe("PERMANENT");
  });
});
