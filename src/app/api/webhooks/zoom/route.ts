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
  if (r.includes("no answer") || r.includes("missed") || r.includes("forward") || r.includes("cancel") || r.includes("busy") || r.includes("reject")) {
    return "MISSED";
  }
  if (r.includes("answer") || r.includes("connect") || durationSec > 0) return "ANSWERED";
  return "MISSED";
}

/** Zoom's external party is identified by a DID number; the internal party is an extension/user id, not a phone number. */
function externalNumber(log: Record<string, unknown>, side: "caller" | "callee"): string | undefined {
  const didKey = `${side}_did_number`;
  const numberKey = `${side}_number`;
  if (typeof log[didKey] === "string") return log[didKey] as string;
  if (typeof log[numberKey] === "string") return log[numberKey] as string;
  return undefined;
}

async function recordZoomCallLog(organizationId: string, log: Record<string, unknown>) {
  const callId = String(log.call_id ?? log.id ?? "");
  if (!callId) {
    console.log("[zoom webhook] skipped: no call_id/id in payload", JSON.stringify(log).slice(0, 500));
    return;
  }

  const existing = await prisma.call.findFirst({ where: { organizationId, externalId: callId } });
  if (existing) {
    console.log(`[zoom webhook] skipped: call ${callId} already recorded`);
    return;
  }

  const direction = mapDirection(log.direction);
  const callerNumber = externalNumber(log, "caller");
  const calleeNumber = externalNumber(log, "callee");
  const customerNumber = direction === "OUTBOUND" ? calleeNumber : callerNumber;
  if (!customerNumber) {
    console.log(`[zoom webhook] skipped: no caller/callee number for call ${callId}`, JSON.stringify(log).slice(0, 500));
    return;
  }

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
  const hasRecording = Boolean(log.recording_id ?? log.has_recording ?? log.recording_type);

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

  if (hasRecording) {
    await prisma.call.update({
      where: { id: call.id },
      data: { recordingUrl: `/api/leads/${lead.id}/calls/${call.id}/recording` },
    });
  }

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

  console.log(`[zoom webhook] recorded call ${call.id} for lead ${lead.id}`);
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
    console.log(`[zoom webhook] ${payload.event}: ${callLogs.length} call log(s)`);
    for (const log of callLogs) {
      await recordZoomCallLog(organizationId, log);
    }
  } else {
    console.log(`[zoom webhook] ignored event: ${payload.event}`);
  }

  return NextResponse.json({ ok: true });
}
