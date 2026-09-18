// Pure webhook verification + parsing logic — no env access, so it's
// unit-testable directly. lib/meta/metaWebhooks.ts wraps these with the
// actual env values (META_VERIFY_TOKEN / META_APP_SECRET) for use in the
// route handler.

import { createHmac, timingSafeEqual } from "node:crypto";

// ---------- GET verification handshake ----------

/**
 * Handles the Meta webhook verification handshake: Meta calls
 * GET /api/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * and expects the raw challenge string echoed back with a 200 if the
 * token matches what you configured in the App Dashboard.
 */
export function verifyWebhookChallenge(
  searchParams: URLSearchParams,
  expectedVerifyToken: string
): string | null {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && expectedVerifyToken && token === expectedVerifyToken) {
    return challenge;
  }
  return null;
}

// ---------- POST signature verification ----------

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends on every webhook
 * POST, computed as HMAC-SHA256 of the raw request body using your app
 * secret. Must be run against the *raw* (unparsed) body string —
 * re-serialising parsed JSON can change byte-for-byte formatting and
 * break the comparison.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!appSecret || !signatureHeader) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  let expectedBuf: Buffer;
  let providedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, "hex");
    providedBuf = Buffer.from(provided, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// ---------- Payload parsing ----------

export interface WhatsAppStatusEvent {
  metaMessageId: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: string; // unix seconds, as a string, per Meta's payload
  recipientId: string;
  errors: Array<{ code?: number; title?: string; message?: string }>;
  dedupeKey: string;
}

export interface WhatsAppInboundMessage {
  from: string; // wa_id, no leading "+"
  waMessageId: string;
  timestamp: string;
  type: string;
  text: string | null;
}

interface WebhookValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  statuses?: Array<{
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
  }>;
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body?: string };
  }>;
}

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ value?: WebhookValue; field?: string }>;
  }>;
}

export function dedupeKeyForStatusEvent(e: {
  metaMessageId: string;
  status: string;
  timestamp: string;
}): string {
  return `${e.metaMessageId}:${e.status}:${e.timestamp}`;
}

/** Extracts every message-status event (sent/delivered/read/failed) from a webhook payload. */
export function parseStatusEvents(payload: WhatsAppWebhookPayload): WhatsAppStatusEvent[] {
  const events: WhatsAppStatusEvent[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const event = {
          metaMessageId: status.id,
          status: status.status,
          timestamp: status.timestamp,
          recipientId: status.recipient_id,
          errors: status.errors ?? [],
        };
        events.push({ ...event, dedupeKey: dedupeKeyForStatusEvent(event) });
      }
    }
  }
  return events;
}

/** Extracts inbound user messages (used for opt-out keyword detection). */
export function parseInboundMessages(payload: WhatsAppWebhookPayload): WhatsAppInboundMessage[] {
  const messages: WhatsAppInboundMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        messages.push({
          from: msg.from,
          waMessageId: msg.id,
          timestamp: msg.timestamp,
          type: msg.type,
          text: msg.type === "text" ? msg.text?.body ?? null : null,
        });
      }
    }
  }
  return messages;
}
