import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";

const FULL_ACCESS_ROLES = ["ADMIN", "MANAGER", "QA", "MARKETING"] as const;

export function hasFullLeadVisibility(role: SessionPayload["role"]) {
  return (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

export function isAdmin(role: SessionPayload["role"]) {
  return role === "ADMIN";
}

/**
 * The role-based visibility rule for leads (and everything hanging off a
 * lead — conversations, calls, tasks):
 *  - Super Admin / Manager / QA / Marketing: everything in the org.
 *  - Sales agent: only leads a Super Admin has allocated to them.
 *  - Lead entry: only leads THEY entered, and only for 24 hours after
 *    creation — after that it drops off their view (but stays for Admin).
 */
export function leadWhereForSession(session: SessionPayload): Prisma.LeadWhereInput {
  if (hasFullLeadVisibility(session.role)) return {};

  if (session.role === "LEAD_ENTRY") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return { createdById: session.sub, createdAt: { gte: since } };
  }

  // AGENT and any other role default to "only what's allocated to me".
  return { ownerId: session.sub };
}

export const NAV_ACCESS: Record<string, SessionPayload["role"][]> = {
  "/": ["ADMIN", "MANAGER", "QA", "MARKETING", "AGENT"],
  "/leads": ["ADMIN", "MANAGER", "QA", "MARKETING", "AGENT", "LEAD_ENTRY"],
  "/pipeline": ["ADMIN", "MANAGER", "QA", "MARKETING", "AGENT"],
  "/inbox": ["ADMIN", "MANAGER", "QA", "MARKETING", "AGENT"],
  "/calls": ["ADMIN", "MANAGER", "QA", "MARKETING", "AGENT"],
  "/tasks": ["ADMIN", "MANAGER", "QA", "MARKETING", "AGENT"],
  "/reports": ["ADMIN", "MANAGER", "MARKETING"],
  "/settings": ["ADMIN"],
};

export function canAccess(role: SessionPayload["role"], path: string) {
  const match = Object.keys(NAV_ACCESS)
    .filter((p) => path === p || path.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return true; // unlisted paths (e.g. /login) aren't gated here
  return NAV_ACCESS[match].includes(role);
}
