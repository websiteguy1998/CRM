import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { fetchCallHistory } from "@/lib/integrations/zoom";
import { recordZoomCallLog } from "@/lib/integrations/zoom-call-sync";

/**
 * One-time (re-runnable) import of Zoom Phone calls that already happened
 * before the webhook was connected. Safe to run more than once — each log
 * is deduped on Zoom's call_id, so re-imports just skip what's already
 * recorded.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can import call history" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 180);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const toStr = to.toISOString().slice(0, 10);
  const fromStr = from.toISOString().slice(0, 10);

  let logs: Record<string, unknown>[];
  try {
    logs = await fetchCallHistory(auth.session.orgId, { from: fromStr, to: toStr });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 502 });
  }

  if (logs[0]) {
    console.log("[zoom backfill] sample call log entry:", JSON.stringify(logs[0]));
  }

  let recorded = 0;
  let duplicate = 0;
  let skipped = 0;
  for (const log of logs) {
    const outcome = await recordZoomCallLog(auth.session.orgId, log, "[zoom backfill]");
    if (outcome === "recorded") recorded += 1;
    else if (outcome === "duplicate") duplicate += 1;
    else skipped += 1;
  }

  return NextResponse.json({ total: logs.length, recorded, duplicate, skipped, from: fromStr, to: toStr });
}
