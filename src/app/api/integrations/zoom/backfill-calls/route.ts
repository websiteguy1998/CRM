import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { syncZoomCallHistory } from "@/lib/integrations/zoom-call-sync";

/**
 * One-time (re-runnable) import of Zoom Phone calls that already happened
 * before the webhook was connected, or a wide re-sync to pick up
 * duration/recording that finished after the webhook's first event. Safe
 * to run more than once — each log is deduped on Zoom's call_id.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can import call history" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 180);

  try {
    const result = await syncZoomCallHistory(auth.session.orgId, days, "[zoom backfill]");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 502 });
  }
}
