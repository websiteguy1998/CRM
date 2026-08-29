import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { syncZoomCallHistory } from "@/lib/integrations/zoom-call-sync";

/**
 * Lightweight re-sync of just the last day of Zoom calls — triggered
 * automatically (see PendingCallSync) when someone opens the Calls page,
 * so a call that's still showing 0:00/no recording because Zoom's webhook
 * fired before it was finished gets corrected without anyone having to
 * remember to run the big "Import past calls" backfill. Any authenticated
 * user can trigger it — it only pulls in data, never deletes anything.
 */
export async function POST(_req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  try {
    const result = await syncZoomCallHistory(auth.session.orgId, 1, "[zoom recent-sync]");
    return NextResponse.json(result);
  } catch {
    // Not connected, or Zoom's API hiccuped — silently no-op, this runs
    // unattended in the background and shouldn't surface an error toast.
    return NextResponse.json({ total: 0, recorded: 0, updated: 0, unchanged: 0, skipped: 0 });
  }
}
