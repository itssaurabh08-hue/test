// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { getEnv } from "@/lib/env";
import {
  classifyMetaErrorCode,
  classifyTransportError,
  type ErrorCategory,
  type MetaApiErrorShape,
} from "@/lib/meta/errorClassification";

/**
 * Structured error shape used everywhere we surface a Meta API failure
 * (stored on Message rows, shown in the UI). Matches the shape requested
 * in the project brief: { provider, code, message, type, timestamp }.
 */
export class MetaApiError extends Error {
  readonly provider = "meta" as const;
  readonly code?: number;
  readonly type?: string;
  readonly httpStatus?: number;
  readonly category: ErrorCategory;
  readonly timestamp: string;
  readonly raw: unknown;

  constructor(params: {
    message: string;
    code?: number;
    type?: string;
    httpStatus?: number;
    raw?: unknown;
  }) {
    super(params.message);
    this.name = "MetaApiError";
    this.code = params.code;
    this.type = params.type;
    this.httpStatus = params.httpStatus;
    this.raw = params.raw;
    this.timestamp = new Date().toISOString();
    this.category =
      params.code !== undefined
        ? classifyMetaErrorCode(params.code)
        : classifyTransportError(params.httpStatus);
  }

  toStructured() {
    return {
      provider: this.provider,
      code: this.code ?? null,
      message: this.message,
      type: this.type ?? null,
      category: this.category,
      timestamp: this.timestamp,
    };
  }
}

function baseUrl(): string {
  return `https://graph.facebook.com/${getEnv().META_GRAPH_API_VERSION}`;
}

interface MetaRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/**
 * Thin, faithful wrapper around the Meta Graph API. All Meta HTTP calls in
 * this codebase should go through this function so the API version, auth
 * header, and error shape stay in exactly one place.
 */
export async function metaGraphRequest<T>(
  path: string,
  options: MetaRequestOptions = {}
): Promise<T> {
  const env = getEnv();
  if (!env.META_ACCESS_TOKEN) {
    throw new MetaApiError({
      message:
        "META_ACCESS_TOKEN is not configured. Set it in your environment (see docs/META_SETUP.md).",
    });
  }

  const url = new URL(`${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new MetaApiError({
      message: err instanceof Error ? err.message : "Network error calling Meta API",
    });
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Non-JSON response body (rare — usually only on total outages).
  }

  if (!response.ok) {
    const errorBody = (json as { error?: MetaApiErrorShape } | null)?.error;
    throw new MetaApiError({
      message: errorBody?.message ?? `Meta API request failed with status ${response.status}`,
      code: errorBody?.code,
      type: errorBody?.type,
      httpStatus: response.status,
      raw: json,
    });
  }

  return json as T;
}

export function getPhoneNumberId(): string {
  const id = getEnv().META_PHONE_NUMBER_ID;
  if (!id) {
    throw new MetaApiError({ message: "META_PHONE_NUMBER_ID is not configured." });
  }
  return id;
}

export function getWabaId(): string {
  const id = getEnv().META_WABA_ID;
  if (!id) {
    throw new MetaApiError({ message: "META_WABA_ID is not configured." });
  }
  return id;
}
