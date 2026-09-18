// No `server-only` guard — see the comment in lib/db/prisma.ts.
import { getRedisConnection } from "@/lib/queue/connection";

const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60;

function keyFor(email: string): string {
  return `login-attempts:${email.toLowerCase().trim()}`;
}

/** Returns true if this email has exceeded the failed-login threshold in the current window. */
export async function isLoginRateLimited(email: string): Promise<boolean> {
  const count = await getRedisConnection().get(keyFor(email));
  return count !== null && Number(count) >= MAX_ATTEMPTS;
}

export async function recordFailedLogin(email: string): Promise<void> {
  const redis = getRedisConnection();
  const key = keyFor(email);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
}

export async function clearLoginAttempts(email: string): Promise<void> {
  await getRedisConnection().del(keyFor(email));
}
