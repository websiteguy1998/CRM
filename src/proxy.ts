import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import type { Role } from "@prisma/client";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup/start",
  "/api/auth/signup/verify",
];
const PUBLIC_PREFIXES = ["/api/webhooks", "/_next", "/favicon.ico"];
// API routes are guarded by their own handlers (requireApiSession + role
// checks) — the page-access gate below only makes sense for page routes.
const API_PREFIX = "/api";

async function getSessionRole(req: NextRequest): Promise<Role | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return (payload as { role?: Role }).role ?? null;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }

  const role = await getSessionRole(req);
  if (!role) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!pathname.startsWith(API_PREFIX) && !canAccess(role, pathname)) {
    return NextResponse.redirect(new URL("/leads", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
