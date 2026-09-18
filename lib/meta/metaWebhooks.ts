// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { getEnv } from "@/lib/env";
import {
  verifyWebhookChallenge as verifyWebhookChallengePure,
  verifyWebhookSignature as verifyWebhookSignaturePure,
} from "@/lib/meta/webhookParsing";

export * from "@/lib/meta/webhookParsing";

/** Convenience wrapper that reads META_VERIFY_TOKEN from the environment. */
export function verifyWebhookChallenge(searchParams: URLSearchParams): string | null {
  return verifyWebhookChallengePure(searchParams, getEnv().META_VERIFY_TOKEN);
}

/** Convenience wrapper that reads META_APP_SECRET from the environment. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  return verifyWebhookSignaturePure(rawBody, signatureHeader, getEnv().META_APP_SECRET);
}
