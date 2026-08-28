import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPrimaryOrganizationId } from "@/lib/org";
import { getZoomConfig, computeZoomChallengeResponse, verifyZoomSignature } from "@/lib/integrations/zoom";
import { findOrCreateLeadForContact } from "@/lib/inbound";
import { logActivity } from "@/lib/timeline";
import type { CallDirection, CallStatus } from "@prisma/client";

function mapDirection(raw: unknown): CallDirection {
  return String(raw ?? "").toLowerCase() === "outbound" ? "OUTBOUND" : "INBOUND";
}

function mapStatus(result: unknown, durationSec: number): CallStatus {
  const r = String(result ?? "").toLowerCase();
  if (r.includes("voicemail")) return "VOICEMAIL";
  if (r.includes("no answer")) return "NO_ANSWER";
  if (r.includes("missed") || r.includes("forward") || r.includes("cancel") || r.includes("busy") || r.includes("reject")) {
    return "MISSED";
  }
  if (r.includes("connect") || durationSec > 0) return "ANSWERED";
  return "MISSED";
}

async function recordZoomCallLog(organizationId: string, log: Record<string, unknown>) {
  const callId = String(log.call_id ?? log.id ?? "");
  if (!callId) return;

  const existing = await prisma.call.findFirst({ where: { organizationId, externalId: callId } });
  if (existing) return;

  const direction = mapDirection(log.direction);
  const callerNumber = typeof log.caller_number === "string" ? log.caller_number : undefined;
  const calleeNumber = typeof log.callee_number === "string" ? log.callee_number : undefined;
  const customerNumber = direction === "OUTBOUND" ? calleeNumber : callerNumber;
  if (!customerNumber) return;

  const lead = await findOrCreateLeadForContact({
    organizationId,
    phone: customerNumber,
    displayName:
      direction === "OUTBOUND"
        ? (log.callee_name as string | undefined)
        : (log.caller_name as string | undefined),
    inboundSourceName: "Zoom Phone",
  });

  const durationSec = Number(log.duration ?? 0) || 0;
  const status = mapStatus(log.result, durationSec);
  const dateTime = typeof log.date_time === "string" ? new Date(log.date_time) : new Date();

  const call = await prisma.call.create({
    data: {
      organizationId,
      leadId: lead.id,
      direction,
      status,
      fromNumber: callerNumber,
      toNumber: calleeNumber,
      durationSec,
      externalId: callId,
      startedAt: Number.isNaN(dateTime.getTime()) ? new Date() : dateTime,
    },
  });

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  await logActivity({
    organizationId,
    leadId: lead.id,
    type: "CALL_LOGGED",
    summary: `📞 ${direction === "OUTBOUND" ? "Outbound" : "Inbound"} Zoom call — ${status.toLowerCase()}${
      status === "ANSWERED" ? ` (${minutes}:${seconds.toString().padStart(2, "0")})` : ""
    }`,
    metadata: { callId: call.id },
  });
}

/**
 * Zoom Phone webhook. Handles the one-time `endpoint.url_validation`
 * handshake Zoom requires when you save the webhook URL in the Marketplace
 * app, and ongoing call-log-completed events for automatic call sync (see
 * src/lib/integrations/zoom.ts for the click-to-call half). Zoom
 * deprecated `phone.call_log_completed` in Nov 2025 in favor of
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
    for (const log of callLogs) {
      await recordZoomCallLog(organizationId, log);
    }
  }

  return NextResponse.json({ ok: true });
}
