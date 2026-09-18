/**
 * Best-effort classification of Meta Graph API / WhatsApp Cloud API error
 * codes into retry categories. This list is derived from Meta's published
 * error code documentation and is not guaranteed exhaustive — Meta adds
 * and reclassifies codes over time. When in doubt we default to
 * "UNKNOWN", which the retry policy (lib/queue/) treats conservatively
 * (a small number of retries, then give up) rather than looping forever
 * or silently dropping a message. Review/extend this table if you see
 * repeated UNKNOWN codes in production.
 */

export type ErrorCategory = "TRANSIENT" | "PERMANENT" | "UNKNOWN";

// code -> category
const KNOWN_CODES: Record<number, ErrorCategory> = {
  1: "TRANSIENT", // API Unknown Error
  2: "TRANSIENT", // Service temporarily unavailable
  4: "TRANSIENT", // Too many API calls / throughput limit
  10: "PERMANENT", // Permission denied
  80007: "TRANSIENT", // Rate limit hit for the WABA
  100: "PERMANENT", // Invalid parameter
  131000: "UNKNOWN", // Generic/unspecified error
  131005: "PERMANENT", // Access denied
  131008: "PERMANENT", // Required parameter missing
  131009: "PERMANENT", // Parameter value invalid
  131016: "TRANSIENT", // Service unavailable, retry later
  131021: "PERMANENT", // Recipient invalid (e.g. same as sender)
  131026: "PERMANENT", // Message undeliverable (invalid/unreachable number)
  131031: "PERMANENT", // Account locked / restricted
  131047: "PERMANENT", // Outside the 24h session window and no valid template
  131048: "TRANSIENT", // Spam rate limit — back off and retry later
  131049: "TRANSIENT", // Business eligibility / frequency capping
  131050: "PERMANENT", // User has opted out (Meta-level)
  131051: "PERMANENT", // Unsupported message type
  131052: "TRANSIENT", // Media download error
  131053: "TRANSIENT", // Media upload error
  132000: "PERMANENT", // Template parameter count mismatch
  132001: "PERMANENT", // Template does not exist
  132005: "PERMANENT", // Template text/parameter too long
  132007: "PERMANENT", // Template paused
  132012: "PERMANENT", // Template parameter format mismatch
  132015: "TRANSIENT", // Template message pacing/rate limited
  133004: "PERMANENT", // Server temporarily unavailable during account issue
  133016: "PERMANENT", // Account is not registered
  190: "PERMANENT", // Access token expired/invalid — needs a credential fix, not a retry
  368: "TRANSIENT", // Temporarily restricted for policy review
};

export interface MetaApiErrorShape {
  code?: number;
  message?: string;
  type?: string;
  error_subcode?: number;
}

export function classifyMetaErrorCode(code: number | undefined): ErrorCategory {
  if (code === undefined) return "UNKNOWN";
  return KNOWN_CODES[code] ?? "UNKNOWN";
}

/** HTTP-transport-level errors (no Meta error body at all — network failure, timeout, 5xx with no JSON). */
export function classifyTransportError(httpStatus: number | undefined): ErrorCategory {
  if (httpStatus === undefined) return "TRANSIENT"; // network failure / timeout
  if (httpStatus === 429) return "TRANSIENT";
  if (httpStatus >= 500) return "TRANSIENT";
  if (httpStatus >= 400) return "PERMANENT";
  return "UNKNOWN";
}
