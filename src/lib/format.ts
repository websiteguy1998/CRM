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
