// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { randomUUID } from "node:crypto";
import { metaGraphRequest, getPhoneNumberId, MetaApiError } from "@/lib/meta/metaClient";
import { isMockMode } from "@/lib/env";
import { e164ToWhatsAppFormat } from "@/lib/validation/phone";
import type { OutboundTemplateComponent } from "@/lib/meta/templatePayload";

export * from "@/lib/meta/templatePayload";

export interface SendTemplateMessageParams {
  toE164: string;
  templateName: string;
  languageCode: string;
  components: OutboundTemplateComponent[];
}

export interface SendTemplateMessageResult {
  metaMessageId: string;
  mock: boolean;
  requestPayload: Record<string, unknown>;
  responseRaw: unknown;
}

function buildRequestBody(params: SendTemplateMessageParams) {
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: e164ToWhatsAppFormat(params.toE164),
    type: "template" as const,
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      components: params.components,
    },
  };
}

/**
 * Sends a single template message. In mock mode, no network call is made
 * — a fake Meta message ID is returned and the caller (queue worker)
 * simulates subsequent delivered/read status transitions. Never called
 * directly from a route handler; always go through the queue (Phase 6)
 * so sends are rate-limited and retried consistently.
 */
export async function sendTemplateMessage(
  params: SendTemplateMessageParams
): Promise<SendTemplateMessageResult> {
  const requestPayload = buildRequestBody(params);

  if (isMockMode()) {
    // Simulate an occasional immediate rejection so error-handling paths
    // can be exercised in development (~5% of sends).
    if (Math.random() < 0.05) {
      throw new MetaApiError({
        message: "(mock) Message undeliverable — simulated failure for development testing.",
        code: 131026,
      });
    }
    return {
      metaMessageId: `mock.${randomUUID()}`,
      mock: true,
      requestPayload,
      responseRaw: { mock: true },
    };
  }

  const phoneNumberId = getPhoneNumberId();
  const response = await metaGraphRequest<{
    messaging_product: string;
    contacts: Array<{ input: string; wa_id: string }>;
    messages: Array<{ id: string }>;
  }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: requestPayload,
  });

  const metaMessageId = response.messages?.[0]?.id;
  if (!metaMessageId) {
    throw new MetaApiError({
      message: "Meta API accepted the request but returned no message id.",
      raw: response,
    });
  }

  return { metaMessageId, mock: false, requestPayload, responseRaw: response };
}
