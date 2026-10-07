import { cookies } from "next/headers";

/**
 * Viewer's UTC offset in minutes (Date.getTimezoneOffset() convention),
 * set by TimezoneCookieSync on first render. Falls back to 0 (UTC) for
 * the very first request before the cookie exists — self-corrects on the
 * refresh TimezoneCookieSync triggers right after.
 */
export async function getViewerTzOffset() {
  const store = await cookies();
  const raw = store.get("tzOffset")?.value;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
