import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseStatusEvents,
  parseInboundMessages,
  dedupeKeyForStatusEvent,
} from "@/lib/meta/webhookParsing";

describe("verifyWebhookChallenge", () => {
  it("returns the challenge when mode and token match", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "secret-token",
      "hub.challenge": "12345",
    });
    expect(verifyWebhookChallenge(params, "secret-token")).toBe("12345");
  });

  it("returns null when the token does not match", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "12345",
    });
    expect(verifyWebhookChallenge(params, "secret-token")).toBeNull();
  });

  it("returns null when mode is not subscribe", () => {
    const params = new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "secret-token",
      "hub.challenge": "12345",
    });
    expect(verifyWebhookChallenge(params, "secret-token")).toBeNull();
  });
});

describe("verifyWebhookSignature", () => {
  const appSecret = "test-app-secret";
  const rawBody = JSON.stringify({ hello: "world" });

  function sign(body: string, secret: string): string {
    return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
  }

  it("accepts a correctly signed body", () => {
    expect(verifyWebhookSignature(rawBody, sign(rawBody, appSecret), appSecret)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    expect(verifyWebhookSignature(rawBody, sign(rawBody, "wrong-secret"), appSecret)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = sign(rawBody, appSecret);
    expect(verifyWebhookSignature(rawBody + "tampered", signature, appSecret)).toBe(false);
  });

  it("rejects when the signature header is missing", () => {
    expect(verifyWebhookSignature(rawBody, null, appSecret)).toBe(false);
  });

  it("rejects when the app secret is not configured", () => {
    expect(verifyWebhookSignature(rawBody, sign(rawBody, appSecret), "")).toBe(false);
  });
});

describe("parseStatusEvents", () => {
  it("extracts status events from a webhook payload", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-id",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                statuses: [
                  {
                    id: "wamid.HBg",
                    status: "delivered",
                    timestamp: "1700000000",
                    recipient_id: "919876543210",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const events = parseStatusEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      metaMessageId: "wamid.HBg",
      status: "delivered",
      recipientId: "919876543210",
    });
    expect(events[0].dedupeKey).toBe("wamid.HBg:delivered:1700000000");
  });

  it("returns an empty array when there are no statuses", () => {
    expect(parseStatusEvents({})).toEqual([]);
  });

  it("extracts error details on a failed status", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.ABC",
                    status: "failed",
                    timestamp: "1700000001",
                    recipient_id: "919876543210",
                    errors: [{ code: 131026, title: "Message undeliverable" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const events = parseStatusEvents(payload);
    expect(events[0].errors[0].code).toBe(131026);
  });
});

describe("dedupeKeyForStatusEvent — idempotent webhook processing", () => {
  it("produces the same key for the same event delivered twice (a Meta retry)", () => {
    const event = { metaMessageId: "wamid.X", status: "read", timestamp: "1700000002" };
    expect(dedupeKeyForStatusEvent(event)).toBe(dedupeKeyForStatusEvent({ ...event }));
  });

  it("produces different keys for different statuses of the same message", () => {
    const base = { metaMessageId: "wamid.X", timestamp: "1700000002" };
    expect(dedupeKeyForStatusEvent({ ...base, status: "delivered" })).not.toBe(
      dedupeKeyForStatusEvent({ ...base, status: "read" })
    );
  });
});

describe("parseInboundMessages", () => {
  it("extracts inbound text messages", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "919876543210",
                    id: "wamid.IN1",
                    timestamp: "1700000003",
                    type: "text",
                    text: { body: "STOP" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = parseInboundMessages(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("STOP");
    expect(messages[0].from).toBe("919876543210");
  });
});
