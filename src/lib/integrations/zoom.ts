import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Zoom Phone integration (Server-to-Server OAuth app from the Zoom
 * Marketplace). Two pieces:
 *  - Click-to-call: POST /phone/users/{agentEmail}/calls rings the agent's
 *    own Zoom Phone device first, then bridges to the callee once answered
 *    — that's how Zoom Phone's API supports "click to call" today; there's
 *    no way to dial straight to the customer without the agent's device
 *    ringing first.
 *  - Automatic call sync: Zoom calls our webhook (/api/webhooks/zoom) with
 *    `phone.call_log_completed` once a call's log entry is finalized —
 *    that event carries duration, direction, numbers and any recording,
 *    which we attach to the matching lead automatically.
 */

type ZoomConfig = { accountId: string; clientId: string; clientSecret: string; webhookSecretToken?: string };

export async function getZoomConfig(organizationId: string): Promise<ZoomConfig | null> {
  const account = await prisma.integrationAccount.findFirst({
    where: { organizationId, type: "ZOOM_PHONE", status: "CONNECTED" },
    orderBy: { createdAt: "asc" },
  });
  const config = account?.config as Partial<ZoomConfig> | null;
  if (!config?.accountId || !config?.clientId || !config?.clientSecret) return null;
  return {
    accountId: config.accountId,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    webhookSecretToken: config.webhookSecretToken,
  };
}

async function getAccessToken(config: ZoomConfig): Promise<string> {
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(config.accountId)}`,
    { method: "POST", headers: { Authorization: `Basic ${basicAuth}` } }
  );
  if (!res.ok) {
    throw new Error(`Zoom OAuth token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

/**
 * Rings `agentZoomEmail`'s own Zoom Phone device; once they pick up, Zoom
 * bridges the call to `calleeNumber`. Throws with the underlying Zoom error
 * message on failure (e.g. agent has no Zoom Phone license) so the caller
 * can surface something actionable instead of a silent no-op.
 */
export async function clickToCall(organizationId: string, agentZoomEmail: string, calleeNumber: string) {
  const config = await getZoomConfig(organizationId);
  if (!config) {
    throw new Error("Zoom Phone isn't connected yet — add it in Settings → Integrations.");
  }
  const token = await getAccessToken(config);

  const res = await fetch(`https://api.zoom.us/v2/phone/users/${encodeURIComponent(agentZoomEmail)}/calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ callee: calleeNumber }),
  });
  if (!res.ok) {
    throw new Error(`Zoom declined the call request: ${res.status} ${await res.text()}`);
  }
}

/**
 * Looks up the downloadable recording for a finished call (by Zoom's
 * call_id) and returns the Zoom-hosted URL plus the bearer token needed to
 * fetch it — Zoom's recording URLs require that same Authorization header,
 * so callers must proxy the audio through our own server rather than
 * linking the browser straight to Zoom.
 */
export async function getCallRecordingDownloadInfo(
  organizationId: string,
  zoomCallId: string
): Promise<{ url: string; token: string; contentType?: string } | null> {
  const config = await getZoomConfig(organizationId);
  if (!config) return null;
  const token = await getAccessToken(config);

  const res = await fetch(`https://api.zoom.us/v2/phone/call_logs/${encodeURIComponent(zoomCallId)}/recordings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const recording = data.recordings?.[0];
  if (!recording?.download_url) return null;
  return { url: recording.download_url, token, contentType: recording.file_type };
}

/**
 * Fetches completed call log entries for the account over a date range,
 * paginating through Zoom's call history API. Used for a one-time backfill
 * of calls that happened before the webhook was connected — ongoing sync
 * relies on the webhook instead, since polling this on every request
 * would be far slower and rate-limit-prone.
 */
export async function fetchCallHistory(
  organizationId: string,
  range: { from: string; to: string }
): Promise<Record<string, unknown>[]> {
  const config = await getZoomConfig(organizationId);
  if (!config) {
    throw new Error("Zoom Phone isn't connected yet — add it in Settings → Integrations.");
  }
  const token = await getAccessToken(config);

  const logs: Record<string, unknown>[] = [];
  let nextPageToken = "";
  let pages = 0;
  do {
    const params = new URLSearchParams({ page_size: "300", from: range.from, to: range.to });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const res = await fetch(`https://api.zoom.us/v2/phone/call_history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Zoom call history request failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    logs.push(...(Array.isArray(data.call_logs) ? data.call_logs : []));
    nextPageToken = typeof data.next_page_token === "string" ? data.next_page_token : "";
    pages += 1;
  } while (nextPageToken && pages < 50);

  return logs;
}

/** Zoom's webhook URL-validation handshake — echoes back an HMAC of their challenge token. */
export function computeZoomChallengeResponse(plainToken: string, secretToken: string) {
  return crypto.createHmac("sha256", secretToken).update(plainToken).digest("hex");
}

/** Verifies the x-zm-signature header on every other Zoom webhook event. */
export function verifyZoomSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secretToken: string
) {
  const hash = crypto.createHmac("sha256", secretToken).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  return signature === `v0=${hash}`;
}
