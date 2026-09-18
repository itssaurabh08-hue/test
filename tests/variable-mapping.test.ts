import { describe, it, expect } from "vitest";
import { resolveVariablesForContact, type VariableMappingConfig } from "@/lib/templates/variableMapping";

const contact = {
  name: "Rahul Sharma",
  phone: "+919876543210",
  email: null,
  metadata: { Event: "Sports Day", "Event Date": "25 September", Grade: "" },
};

describe("resolveVariablesForContact", () => {
  it("resolves a mix of contactField, column and static bindings", () => {
    const mapping: VariableMappingConfig = {
      body: {
        "1": { source: "contactField", value: "name" },
        "2": { source: "column", value: "Event" },
        "3": { source: "column", value: "Event Date" },
      },
    };
    const { input, missing } = resolveVariablesForContact(mapping, contact);
    expect(input.body).toEqual({ "1": "Rahul Sharma", "2": "Sports Day", "3": "25 September" });
    expect(missing).toEqual([]);
  });

  it("reports missing variables when a mapped column is blank", () => {
    const mapping: VariableMappingConfig = {
      body: { "1": { source: "column", value: "Grade" } },
    };
    const { missing } = resolveVariablesForContact(mapping, contact);
    expect(missing).toEqual(["Body {{1}}"]);
  });

  it("reports missing variables when a mapped column does not exist on the contact", () => {
    const mapping: VariableMappingConfig = {
      body: { "1": { source: "column", value: "NonexistentColumn" } },
    };
    const { input, missing } = resolveVariablesForContact(mapping, contact);
    expect(input.body?.["1"]).toBe("");
    expect(missing).toContain("Body {{1}}");
  });

  it("resolves a static binding the same for every contact", () => {
    const mapping: VariableMappingConfig = {
      body: { "1": { source: "static", value: "Our School" } },
    };
    const { input } = resolveVariablesForContact(mapping, contact);
    expect(input.body?.["1"]).toBe("Our School");
  });

  it("resolves header text and media bindings", () => {
    const mapping: VariableMappingConfig = {
      body: {},
      headerText: { source: "contactField", value: "name" },
      headerMediaLink: { source: "static", value: "https://example.com/banner.jpg" },
    };
    const { input, missing } = resolveVariablesForContact(mapping, contact);
    expect(input.headerText).toBe("Rahul Sharma");
    expect(input.headerMediaLink).toBe("https://example.com/banner.jpg");
    expect(missing).toEqual([]);
  });

  it("resolves button parameters and flags missing ones", () => {
    const mapping: VariableMappingConfig = {
      body: {},
      buttons: { 0: { source: "column", value: "Grade" } },
    };
    const { missing } = resolveVariablesForContact(mapping, contact);
    expect(missing).toEqual(["Button 1"]);
  });
});
