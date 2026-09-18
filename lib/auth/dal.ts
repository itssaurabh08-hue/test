import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionFromCookies, type SessionPayload } from "@/lib/auth/session";

/**
 * Verifies the session for the current request. This is the one place
 * route handlers, server actions and pages should call to authorize a
 * request — do not read the cookie/JWT directly elsewhere.
 */
export const verifySession = cache(async (): Promise<SessionPayload | null> => {
  return readSessionFromCookies();
});

/** Redirects to /login if there is no valid session. Use in pages/layouts. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await verifySession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/** Redirects to /login (or /dashboard) unless the session is an admin. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireUser();
  if (session.role !== "ADMIN") {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

/** For Route Handlers: returns null instead of redirecting. */
export async function getApiSession(): Promise<SessionPayload | null> {
  return verifySession();
}
