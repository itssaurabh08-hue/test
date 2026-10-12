import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionFromCookies, type SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

/**
 * DEV-ONLY ESCAPE HATCH. When DISABLE_AUTH=true, every request is treated
 * as the first ADMIN user in the database — no login required. This
 * exists purely so a non-technical person previewing the app in a
 * private Codespace doesn't have to deal with a login screen; it is NOT
 * how the app is meant to run normally (the brief requires auth on every
 * route), and it must never be set in anything reachable by anyone else.
 * See the "AUTH DISABLED" banner this triggers in the UI.
 */
function isAuthDisabled(): boolean {
  return process.env.DISABLE_AUTH === "true";
}

async function getAuthBypassSession(): Promise<SessionPayload> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error(
      "DISABLE_AUTH=true but no admin user exists yet — run `pnpm db:seed` first."
    );
  }
  return { userId: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

/**
 * Verifies the session for the current request. This is the one place
 * route handlers, server actions and pages should call to authorize a
 * request — do not read the cookie/JWT directly elsewhere.
 */
export const verifySession = cache(async (): Promise<SessionPayload | null> => {
  if (isAuthDisabled()) {
    return getAuthBypassSession();
  }
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
