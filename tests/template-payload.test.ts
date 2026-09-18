import { describe, it, expect } from "vitest";
import {
  buildTemplateComponents,
  extractBodyVariableIndexes,
  TemplatePayloadError,
} from "@/lib/meta/templatePayload";
import type { MetaTemplate } from "@/lib/meta/metaTemplates";

const eventTemplate: MetaTemplate = {
  name: "event_invitation",
  language: "en_US",
  category: "MARKETING",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "TEXT", text: "You're invited!" },
    { type: "BODY", text: "Hello {{1}},\nYou are invited to {{2}} on {{3}}." },
    { type: "FOOTER", text: "Reply STOP to opt out" },
  ],
};

const noVariableTemplate: MetaTemplate = {
  name: "hello_world",
  language: "en_US",
  category: "UTILITY",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "TEXT", text: "Hello World" },
    { type: "BODY", text: "Welcome!" },
  ],
};

const mediaHeaderTemplate: MetaTemplate = {
  name: "receipt",
  language: "en_US",
  category: "UTILITY",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Thanks for your order, {{1}}." },
  ],
};

describe("extractBodyVariableIndexes", () => {
  it("extracts and sorts variable indexes from the body text", () => {
    expect(extractBodyVariableIndexes(eventTemplate)).toEqual([1, 2, 3]);
  });

  it("returns an empty array for a body with no variables", () => {
    expect(extractBodyVariableIndexes(noVariableTemplate)).toEqual([]);
  });
});

describe("buildTemplateComponents", () => {
  it("builds header + body components for a template with variables in both", () => {
    const components = buildTemplateComponents(eventTemplate, {
      headerText: undefined, // header here is static text, no variable
      body: { "1": "Rahul", "2": "Sports Day", "3": "25 September" },
    });
    // header has no {{n}}, so it should NOT appear in the outbound components
    expect(components.find((c) => c.type === "header")).toBeUndefined();
    const body = components.find((c) => c.type === "body");
    expect(body?.parameters).toEqual([
      { type: "text", text: "Rahul" },
      { type: "text", text: "Sports Day" },
      { type: "text", text: "25 September" },
    ]);
  });

  it("omits body component entirely when the template has no body variables", () => {
    const components = buildTemplateComponents(noVariableTemplate, {});
    expect(components).toEqual([]);
  });

  it("throws TemplatePayloadError when a required body variable is missing", () => {
    expect(() =>
      buildTemplateComponents(eventTemplate, { body: { "1": "Rahul", "2": "Sports Day" } })
    ).toThrow(TemplatePayloadError);
  });

  it("throws TemplatePayloadError when a required body variable is an empty string", () => {
    expect(() =>
      buildTemplateComponents(eventTemplate, {
        body: { "1": "Rahul", "2": "", "3": "25 September" },
      })
    ).toThrow(TemplatePayloadError);
  });

  it("builds an image header component when a media link is provided", () => {
    const components = buildTemplateComponents(mediaHeaderTemplate, {
      headerMediaLink: "https://example.com/receipt.jpg",
      body: { "1": "Rahul" },
    });
    const header = components.find((c) => c.type === "header");
    expect(header?.parameters).toEqual([
      { type: "image", image: { link: "https://example.com/receipt.jpg" } },
    ]);
  });

  it("throws TemplatePayloadError when a required media header link is missing", () => {
    expect(() =>
      buildTemplateComponents(mediaHeaderTemplate, { body: { "1": "Rahul" } })
    ).toThrow(TemplatePayloadError);
  });
});
