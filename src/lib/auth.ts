import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const SESSION_COOKIE = "crm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  // The CRM whose data (leads, calls, tasks...) this request works on — CRM
  // A or CRM B, whichever the admin Switch has made active. getSession()
  // fills this in on every request; the token itself carries homeOrgId.
  orgId: string;
  // The org the user account, its teammates and integrations belong to
  // (always CRM A). Use this, not orgId, for anything about users.
  homeOrgId: string;
  role: Role;
  name: string;
  email: string;
  iat?: number; // JWT standard claim (seconds since epoch), set by setIssuedAt() — used to honor force-logout-all
};

// What's signed into the cookie. orgId here is the user's home org;
// getSession() turns it into homeOrgId + the active CRM's orgId.
type TokenPayload = Omit<SessionPayload, "homeOrgId">;

export async function createSessionToken(payload: TokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function setSessionCookie(payload: TokenPayload) {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function verifySessionToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const homeOrgId = payload.orgId;

  // A "log out everyone" timestamp instead of a server-side session list —
  // a token issued before it just stops being honored, even though its
  // signature and expiry are still fine on their own.
  const org = await prisma.organization.findUnique({
    where: { id: homeOrgId },
    select: { sessionsInvalidatedAt: true, activeWorkspaceId: true },
  });
  if (
    org?.sessionsInvalidatedAt &&
    payload.iat != null &&
    payload.iat * 1000 < org.sessionsInvalidatedAt.getTime()
  ) {
    return null;
  }

  // The admin Switch (CRM A <-> CRM B) — read fresh on every request, so
  // everyone moves over on their next page load without logging in again.
  return { ...payload, homeOrgId, orgId: org?.activeWorkspaceId ?? homeOrgId };
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.sub } });
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
