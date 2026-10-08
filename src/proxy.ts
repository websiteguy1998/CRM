import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { canAccess } from "@/lib/access";
import { CRM_B_PREFIX, CRM_HEADER, SESSION_COOKIES, crmPrefix, type CrmWs } from "@/lib/crm";
import type { Role } from "@prisma/client";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup/start",
  "/api/auth/signup/verify",
  // Switch-over from a CRM A login to CRM B — the user has no CRM B login yet.
  "/api/auth/handoff",
];
const PUBLIC_PREFIXES = ["/api/webhooks", "/_next", "/favicon.ico"];
// API routes are guarded by their own handlers (requireApiSession + role
// checks) — the page-access gate below only makes sense for page routes.
const API_PREFIX = "/api";

async function getSessionRole(req: NextRequest, ws: CrmWs): Promise<Role | null> {
  const token = req.cookies.get(SESSION_COOKIES[ws].name)?.value;
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

/**
 * CRM B is the same app served under /crm-b (see lib/crm.ts): strip the
 * prefix, route to the normal page/API, and tag the request so the server
 * knows which CRM — and which login cookie — it's serving.
 */
export async function proxy(req: NextRequest) {
  const fullPath = req.nextUrl.pathname;
  const isCrmB = fullPath === CRM_B_PREFIX || fullPath.startsWith(`${CRM_B_PREFIX}/`);
  const ws: CrmWs = isCrmB ? "b" : "a";
  const pathname = isCrmB ? fullPath.slice(CRM_B_PREFIX.length) || "/" : fullPath;
  const prefix = crmPrefix(ws);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(CRM_HEADER);
  if (isCrmB) requestHeaders.set(CRM_HEADER, "b");
  const pass = () => {
    if (!isCrmB) return NextResponse.next({ request: { headers: requestHeaders } });
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  };

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return pass();
  }

  const role = await getSessionRole(req, ws);
  if (!role) {
    const loginUrl = new URL(`${prefix}/login`, req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", `${prefix}${pathname}`);
    return NextResponse.redirect(loginUrl);
  }

  if (!pathname.startsWith(API_PREFIX) && !canAccess(role, pathname)) {
    return NextResponse.redirect(new URL(`${prefix}/leads`, req.url));
  }

  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
