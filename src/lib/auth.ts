import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CRM_HEADER, SESSION_COOKIES, type CrmWs } from "@/lib/crm";
import { getCrmBOrgId } from "@/lib/workspace";
import type { Role } from "@prisma/client";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  // The CRM whose data (leads, calls, tasks...) this request works on — CRM
  // A's org or CRM B's, depending on which URL the request came in on.
  orgId: string;
  // The org the user account, its teammates and integrations belong to
  // (always CRM A). Use this, not orgId, for anything about users.
  homeOrgId: string;
  ws: CrmWs;
  role: Role;
  name: string;
  email: string;
  iat?: number; // JWT standard claim (seconds since epoch), set by setIssuedAt() — used to honor the admin Switch
};

// What's signed into the cookie. orgId here is the user's home org;
// getSession() turns it into homeOrgId + the CRM's own orgId.
export type TokenPayload = Omit<SessionPayload, "homeOrgId">;

/** Which CRM this request is for — proxy.ts tags every CRM_B_PREFIX request. */
export async function getCrmWs(): Promise<CrmWs> {
  return (await headers()).get(CRM_HEADER) === "b" ? "b" : "a";
}

export async function createSessionToken(payload: TokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Logs the user into the CRM given by payload.ws. */
export async function setSessionCookie(payload: TokenPayload) {
  const token = await createSessionToken(payload);
  const { name, path } = SESSION_COOKIES[payload.ws];
  const store = await cookies();
  store.set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(ws: CrmWs) {
  const store = await cookies();
  store.delete(SESSION_COOKIES[ws]);
}

export async function verifySessionToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const p = payload as unknown as TokenPayload;
    // Tokens from before CRM B existed carry no ws — they were CRM A logins.
    return { ...p, ws: p.ws ?? "a" };
  } catch {
    return null;
  }
}

/** The signed token in this CRM's cookie, before any server-side checks. */
async function readToken(ws: CrmWs) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIES[ws].name)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  return payload?.ws === ws ? payload : null;
}

export async function getSession(): Promise<SessionPayload | null> {
  const ws = await getCrmWs();
  const payload = await readToken(ws);
  if (!payload) return null;
  const homeOrgId = payload.orgId;

  if (ws === "b") {
    return { ...payload, homeOrgId, orgId: await getCrmBOrgId(homeOrgId) };
  }

  // The admin Switch stamps this instead of keeping a server-side session
  // list — a CRM A token issued before it just stops being honored, even
  // though its signature and expiry are still fine on their own.
  const org = await prisma.organization.findUnique({
    where: { id: homeOrgId },
    select: { sessionsInvalidatedAt: true },
  });
  if (isStale(payload, org?.sessionsInvalidatedAt)) return null;

  return { ...payload, homeOrgId, orgId: homeOrgId };
}

function isStale(payload: TokenPayload, invalidatedAt: Date | null | undefined) {
  return !!invalidatedAt && payload.iat != null && payload.iat * 1000 < invalidatedAt.getTime();
}

/**
 * The CRM A login in this request's cookies if the admin Switch is what
 * ended it — that user gets moved over to CRM B (/api/auth/handoff)
 * instead of being sent to the CRM A login page.
 */
export async function getSwitchedCrmALogin(): Promise<TokenPayload | null> {
  const payload = await readToken("a");
  if (!payload) return null;
  const org = await prisma.organization.findUnique({
    where: { id: payload.orgId },
    select: { sessionsInvalidatedAt: true, activeWorkspaceId: true },
  });
  if (!org?.activeWorkspaceId || !isStale(payload, org.sessionsInvalidatedAt)) return null;
  return payload;
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
