import "server-only";
import { metaGraphRequest, getWabaId } from "@/lib/meta/metaClient";
import { isMockMode } from "@/lib/env";

export interface MetaTemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS" | string;
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | string;
  text?: string;
  example?: {
    header_text?: string[];
    header_handle?: string[];
    body_text?: string[][];
  };
  buttons?: MetaTemplateButton[];
}

export interface MetaTemplate {
  id?: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: MetaTemplateComponent[];
}

interface MessageTemplatesResponse {
  data: MetaTemplate[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

const MOCK_TEMPLATES: MetaTemplate[] = [
  {
    id: "mock-hello-world",
    name: "hello_world",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    components: [
      {
        type: "HEADER",
        format: "TEXT",
        text: "Hello World",
      },
      {
        type: "BODY",
        text: "Welcome and congratulations! This is a sample message sent from the WhatsApp Business Platform.",
      },
      { type: "FOOTER", text: "WhatsApp Business Platform sample message" },
    ],
  },
  {
    id: "mock-event-invite",
    name: "event_invitation",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    components: [
      { type: "HEADER", format: "TEXT", text: "You're invited!" },
      {
        type: "BODY",
        text: "Hello {{1}},\nYou are invited to {{2}} on {{3}}. We hope to see you there!",
        example: { body_text: [["Rahul", "Sports Day", "25 September"]] },
      },
      { type: "FOOTER", text: "Reply STOP to opt out" },
    ],
  },
];

/**
 * Lists templates for the configured WABA. In mock mode, returns a small
 * illustrative set instead of calling Meta, so the rest of the app
 * (template picker, variable mapping, preview) can be developed and
 * tested without a live WhatsApp Business Account.
 */
export async function listWabaTemplates(): Promise<MetaTemplate[]> {
  if (isMockMode()) {
    return MOCK_TEMPLATES;
  }

  const wabaId = getWabaId();
  const templates: MetaTemplate[] = [];
  let after: string | undefined;

  do {
    const response = await metaGraphRequest<MessageTemplatesResponse>(
      `/${wabaId}/message_templates`,
      {
        query: {
          fields: "name,language,category,status,components",
          limit: 100,
          after,
        },
      }
    );
    templates.push(...response.data);
    after = response.paging?.cursors?.after;
    // Stop once a page returns fewer than the page size (no more pages) —
    // Meta omits `next` on the last page but keeps `after` populated in
    // some API versions, so we also guard on data length.
    if (response.data.length === 0) break;
  } while (after);

  return templates;
}

/** Only templates Meta has approved and that are currently sendable. */
export function isTemplateSendable(status: string): boolean {
  return status === "APPROVED";
}
