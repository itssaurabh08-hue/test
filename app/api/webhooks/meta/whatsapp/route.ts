import { NextResponse } from "next/server";
import {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseStatusEvents,
  parseInboundMessages,
  type WhatsAppWebhookPayload,
} from "@/lib/meta/metaWebhooks";
import { applyMessageStatusUpdate } from "@/lib/campaigns/webhookStatusProcessor";
import { processInboundMessagesForOptOut } from "@/lib/suppression/optOutService";

// Meta's webhook verification handshake — called once when you configure
// the callback URL in the App Dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = verifyWebhookChallenge(url.searchParams);
  if (challenge === null) {
    return NextResponse.json({ error: "Verification failed." }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

// Meta calls this for every message-status update and inbound message.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[webhook] rejected request with invalid X-Hub-Signature-256");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Always acknowledge quickly once the signature is verified — Meta
  // retries webhooks that don't get a timely 200, and our processing
  // below is itself idempotent, so there is no harm in occasionally
  // reprocessing a retried delivery.
  try {
    const statusEvents = parseStatusEvents(payload);
    for (const event of statusEvents) {
      await applyMessageStatusUpdate(event);
    }

    const inboundMessages = parseInboundMessages(payload);
    if (inboundMessages.length > 0) {
      await processInboundMessagesForOptOut(inboundMessages);
    }
  } catch (err) {
    // Log and still return 200 — Meta will retry on non-2xx, and a
    // processing bug on our side shouldn't cause unbounded webhook
    // retries. The error is visible in server logs for investigation.
    console.error("[webhook] error processing payload", err);
  }

  return NextResponse.json({ received: true });
}
