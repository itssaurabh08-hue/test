import { describe, it, expect } from "vitest";
import { renderTemplatePreview } from "@/lib/campaigns/preview";
import { resolveVariablesForContact } from "@/lib/templates/variableMapping";
import type { MetaTemplate } from "@/lib/meta/metaTemplates";

const eventTemplate: MetaTemplate = {
  name: "event_invitation",
  language: "en_US",
  category: "MARKETING",
  status: "APPROVED",
  components: [
    { type: "BODY", text: "Hello {{1}},\nYou are invited to {{2}} on {{3}}." },
    { type: "FOOTER", text: "Reply STOP to opt out" },
  ],
};

describe("renderTemplatePreview", () => {
  it("renders a fully personalised preview", () => {
    const resolved = resolveVariablesForContact(
      {
        body: {
          "1": { source: "contactField", value: "name" },
          "2": { source: "column", value: "Event" },
          "3": { source: "column", value: "Event Date" },
        },
      },
      {
        name: "Rahul",
        phone: "+919876543210",
        metadata: { Event: "Sports Day", "Event Date": "25 September" },
      }
    );
    const preview = renderTemplatePreview(eventTemplate, resolved);
    expect(preview.bodyText).toBe("Hello Rahul,\nYou are invited to Sports Day on 25 September.");
    expect(preview.footerText).toBe("Reply STOP to opt out");
    expect(preview.missing).toEqual([]);
  });

  it("marks a missing variable visibly in the preview instead of leaving it blank", () => {
    const resolved = resolveVariablesForContact(
      {
        body: {
          "1": { source: "contactField", value: "name" },
          "2": { source: "column", value: "Event" },
          "3": { source: "column", value: "NoSuchColumn" },
        },
      },
      { name: "Rahul", phone: "+919876543210", metadata: { Event: "Sports Day" } }
    );
    const preview = renderTemplatePreview(eventTemplate, resolved);
    expect(preview.bodyText).toContain("[missing {{3}}]");
    expect(preview.missing).toContain("Body {{3}}");
  });
});
