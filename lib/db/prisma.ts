// No `server-only` guard here: this module is imported both by Next.js
// (server components/routes) and by the standalone BullMQ worker process
// (lib/queue/worker.ts, run via plain `tsx`, outside Next's bundler,
// where `server-only` would throw unconditionally). Safety net for the
// client bundle is structural instead: no "use client" component in this
// app imports lib/db, lib/meta, lib/campaigns, lib/templates, lib/queue,
// or lib/audit — only the pure, non-secret modules under
// lib/validation, lib/contacts/{parse,validate,columnMapping}, and the
// *Payload/parsing pure exports of lib/meta and lib/templates.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
