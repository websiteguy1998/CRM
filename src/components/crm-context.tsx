"use client";

import { createContext, useContext } from "react";
import NextLink from "next/link";
import { withCrmPrefix } from "@/lib/crm";

/**
 * Keeps CRM B's pages on CRM B's URL. The app is written with root paths
 * ("/leads", "/api/leads"), so inside CRM B (CRM_B_PREFIX) every link, router
 * push and same-origin fetch gets the CRM_B_PREFIX prefix added here.
 */
const CrmPrefixContext = createContext("");

let patchedPrefix: string | null = null;

function patchFetch(prefix: string) {
  if (typeof window === "undefined" || patchedPrefix === prefix) return;
  const original = (window as { __crmOriginalFetch?: typeof fetch }).__crmOriginalFetch ?? window.fetch;
  (window as { __crmOriginalFetch?: typeof fetch }).__crmOriginalFetch = original;
  window.fetch = prefix
    ? (input, init) =>
        original(typeof input === "string" ? withCrmPrefix(prefix, input) : input, init)
    : original;
  patchedPrefix = prefix;
}

export function CrmProvider({ prefix, children }: { prefix: string; children: React.ReactNode }) {
  // Installed during render (not in an effect) so it's in place before any
  // child's own effects fetch on mount.
  patchFetch(prefix);
  return <CrmPrefixContext.Provider value={prefix}>{children}</CrmPrefixContext.Provider>;
}

/** Prefixes an app path for the current CRM: "/leads" -> "CRM_B_PREFIX/leads" in CRM B. */
export function useCrmPath() {
  const prefix = useContext(CrmPrefixContext);
  return (path: string) => withCrmPrefix(prefix, path);
}

/** The current CRM's URL prefix ("" in CRM A). */
export function useCrmPrefix() {
  return useContext(CrmPrefixContext);
}

/** next/link for app paths — stays inside the current CRM. */
export function Link({ href, ...props }: React.ComponentProps<typeof NextLink>) {
  const crmPath = useCrmPath();
  return <NextLink href={typeof href === "string" ? crmPath(href) : href} {...props} />;
}
