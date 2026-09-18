// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { Redis } from "ioredis";
import { getEnv } from "@/lib/env";

let connection: Redis | null = null;

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the ioredis connection
 * it's handed (it manages retry/backoff itself); using a shared instance
 * across Queue/Worker/Events avoids opening a new connection per object.
 */
export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}
