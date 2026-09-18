import "server-only";
import { z } from "zod";

// Single source of truth for server-side environment configuration.
// Import this instead of reading `process.env` directly elsewhere, so
// misconfiguration fails fast and loudly instead of surfacing as a
// mysterious runtime bug deep in a queue worker.

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1")
  .default(false);

const intFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : fallback))
    .refine((v) => Number.isFinite(v) && v > 0, "must be a positive integer");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  NEXTAUTH_SECRET: z
    .string()
    .min(16, "NEXTAUTH_SECRET must be at least 16 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  META_ACCESS_TOKEN: z.string().optional().default(""),
  META_WABA_ID: z.string().optional().default(""),
  META_PHONE_NUMBER_ID: z.string().optional().default(""),
  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_VERIFY_TOKEN: z.string().optional().default(""),
  META_GRAPH_API_VERSION: z.string().min(2).default("v23.0"),

  WHATSAPP_MOCK_MODE: boolFromString,

  MAX_MESSAGES_PER_SECOND: intFromString(10),
  MAX_CONCURRENT_JOBS: intFromString(5),
  RETRY_ATTEMPTS: intFromString(3),

  MAX_UPLOAD_FILE_SIZE_MB: intFromString(10),
  DEFAULT_COUNTRY_CODE: z.string().length(2).default("IN"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** True when the app must not call the real Meta API. Always shown in the UI. */
export function isMockMode(): boolean {
  return getEnv().WHATSAPP_MOCK_MODE;
}
