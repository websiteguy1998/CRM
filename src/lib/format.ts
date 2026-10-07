/**
 * Converts a plain "YYYY-MM-DD" date input value into the UTC instant that
 * corresponds to local midnight (or local end-of-day, with endOfDay) in the
 * viewer's timezone. `tzOffsetMinutes` is `Date.getTimezoneOffset()` from
 * the browser — see TimezoneOffsetInput. Without this, a date filter
 * silently misattributes anything created near the start/end of the local
 * day for every viewer not in UTC.
 */
export function localDateBoundary(
  dateStr: string,
  tzOffsetMinutes: number,
  endOfDay = false
) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const base = endOfDay
    ? Date.UTC(year, month - 1, day, 23, 59, 59, 999)
    : Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(base + tzOffsetMinutes * 60_000);
}

/**
 * The UTC instant of local midnight for whatever calendar day it is right
 * now in the viewer's timezone — the "today" equivalent of
 * localDateBoundary, for stats pages that compute "today"/"this month"
 * without a date-picker form to carry tzOffset through (see
 * TimezoneCookieSync, which is where tzOffsetMinutes comes from on these
 * pages). The server's own clock is on UTC, so without this, "today"
 * silently uses the UTC calendar day instead of the viewer's.
 */
export function localStartOfToday(tzOffsetMinutes: number) {
  const localNow = new Date(Date.now() - tzOffsetMinutes * 60_000);
  const y = localNow.getUTCFullYear();
  const m = String(localNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(localNow.getUTCDate()).padStart(2, "0");
  return localDateBoundary(`${y}-${m}-${d}`, tzOffsetMinutes);
}

/** Same idea as localStartOfToday, but the 1st of the viewer's local calendar month. */
export function localStartOfMonth(tzOffsetMinutes: number) {
  const localNow = new Date(Date.now() - tzOffsetMinutes * 60_000);
  const y = localNow.getUTCFullYear();
  const m = String(localNow.getUTCMonth() + 1).padStart(2, "0");
  return localDateBoundary(`${y}-${m}-01`, tzOffsetMinutes);
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function relativeTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let value = diffSec;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let divisor = 1;
  for (const [amount, u] of units) {
    if (abs < divisor * amount) {
      unit = u;
      value = Math.round(diffSec / divisor);
      break;
    }
    divisor *= amount;
  }

  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit);
}

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCurrency(value: number | string, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(value)
  );
}

/**
 * Years of manual entry mean a stored website/ID URL often has no
 * protocol at all ("abccompany.com"). Used directly as an <a href>, that
 * resolves as a relative link on the current page instead of navigating
 * to the actual site. Only prepend a protocol for the href — never touch
 * what's stored or displayed.
 */
export function ensureUrlProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function channelIcon(channel: "WHATSAPP" | "SMS" | "EMAIL") {
  return { WHATSAPP: "💬", SMS: "📱", EMAIL: "📧" }[channel];
}

export function stageColor(name: string, isWon?: boolean, isLost?: boolean) {
  if (isWon) return "bg-emerald-100 text-emerald-700";
  if (isLost) return "bg-rose-100 text-rose-700";
  const map: Record<string, string> = {
    New: "bg-slate-100 text-slate-700",
    Contacted: "bg-sky-100 text-sky-700",
    Interested: "bg-amber-100 text-amber-700",
    "Follow-up": "bg-violet-100 text-violet-700",
  };
  return map[name] ?? "bg-indigo-100 text-indigo-700";
}
