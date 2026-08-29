import { NextRequest, NextResponse } from "next/server";
import { getPrimaryOrganizationId } from "@/lib/org";
import { getZoomConfig, computeZoomChallengeResponse, verifyZoomSignature } from "@/lib/integrations/zoom";
import { recordZoomCallLog } from "@/lib/integrations/zoom-call-sync";

/**
 * Zoom Phone webhook. Handles the one-time `endpoint.url_validation`
 * handshake Zoom requires when you save the webhook URL in the Marketplace
 * app, and ongoing call-log-completed events for automatic call sync (see
 * src/lib/integrations/zoom.ts for the click-to-call half, and
 * src/lib/integrations/zoom-call-sync.ts for the shared call-recording
 * logic also used by the one-time call history backfill). Zoom deprecated
 * `phone.call_log_completed` in Nov 2025 in favor of
 * `phone.callee_call_history_completed` / `phone.caller_call_history_completed`
 * — both the old and new names are handled here since which one an account
 * actually fires depends on when it was set up.
 */
const CALL_LOG_EVENTS = new Set([
  "phone.call_log_completed",
  "phone.callee_call_log_completed",
  "phone.caller_call_log_completed",
  "phone.callee_call_history_completed",
  "phone.caller_call_history_completed",
]);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const organizationId = await getPrimaryOrganizationId();
  const config = await getZoomConfig(organizationId);

  if (payload.event === "endpoint.url_validation") {
    const plainToken = payload.payload?.plainToken;
    if (!config?.webhookSecretToken || !plainToken) {
      return NextResponse.json({ error: "Zoom Phone isn't connected with a webhook secret token yet" }, { status: 400 });
    }
    return NextResponse.json({
      plainToken,
      encryptedToken: computeZoomChallengeResponse(plainToken, config.webhookSecretToken),
    });
  }

  if (!config?.webhookSecretToken) return NextResponse.json({ ok: true });

  const signature = req.headers.get("x-zm-signature") ?? "";
  const timestamp = req.headers.get("x-zm-request-timestamp") ?? "";
  if (!verifyZoomSignature(rawBody, timestamp, signature, config.webhookSecretToken)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (CALL_LOG_EVENTS.has(payload.event)) {
    const object = payload.payload?.object ?? {};
    const callLogs: Record<string, unknown>[] = Array.isArray(object.call_logs) ? object.call_logs : [object];
    console.log(`[zoom webhook] ${payload.event}: ${callLogs.length} call log(s)`);
    for (const log of callLogs) {
      await recordZoomCallLog(organizationId, log, "[zoom webhook]");
    }
  } else {
    console.log(`[zoom webhook] ignored event: ${payload.event}`);
  }

  return NextResponse.json({ ok: true });
}
