/**
 * CRM A lives at the site root, CRM B under CRM_B_PREFIX — same app,
 * separate logins. proxy.ts strips the prefix before routing and tags the
 * request with CRM_HEADER, so every page and API route below serves both
 * CRMs; getSession() reads the tag to pick the cookie and the data org.
 * Safe to import from client components.
 */
export type CrmWs = "a" | "b";

export const CRM_B_PREFIX = "/social-media-crm";
export const CRM_HEADER = "x-crm-ws";

export function crmPrefix(ws: CrmWs) {
  return ws === "b" ? CRM_B_PREFIX : "";
}

/** Prefixes an app-internal absolute path ("/leads") for the given prefix. */
export function withCrmPrefix(prefix: string, path: string) {
  if (!prefix || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) return path;
  return path === "/" ? prefix : `${prefix}${path}`;
}

// CRM A and CRM B log in separately: each has its own cookie, and CRM B's
// is scoped to its CRM_B_PREFIX URL.
export const SESSION_COOKIES: Record<CrmWs, { name: string; path: string }> = {
  a: { name: "crm_session", path: "/" },
  b: { name: "crm_session_b", path: CRM_B_PREFIX },
};
