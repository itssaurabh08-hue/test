import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic auth check only (no DB access here — see lib/auth/dal.ts for
// the real per-request authorization checks). Redirects unauthenticated
// visitors away from protected pages, and authenticated ones away from
// /login. The actual JWT signature is verified again in the DAL for every
// page, server action and route handler — this is just UX.

const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get("session")?.value);
  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isApiAuthPath = pathname.startsWith("/api/auth");

  if (!hasSessionCookie && !isPublicPath && !isApiAuthPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && isPublicPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
