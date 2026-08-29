import { prisma } from "@/lib/prisma";
import { findOrCreateLeadForContact } from "@/lib/inbound";
import { logActivity } from "@/lib/timeline";
import { getPhoneUserEmail } from "@/lib/integrations/zoom";
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

/**
 * The internal party (whichever side isn't the external customer) is
 * identified by a Zoom user id, not an email — resolve it and match
 * against User.zoomUserEmail so the call shows up under the right agent.
 */
async function resolveAgentId(
  organizationId: string,
  direction: CallDirection,
  log: Record<string, unknown>,
  logPrefix: string,
  callId: string
): Promise<string | undefined> {
  const agentZoomUserId = String((direction === "OUTBOUND" ? log.caller_user_id : log.callee_user_id) ?? "");
  if (!agentZoomUserId) return undefined;
  try {
    const email = await getPhoneUserEmail(organizationId, agentZoomUserId);
    if (!email) return undefined;
    const agent = await prisma.user.findFirst({
      where: { organizationId, zoomUserEmail: { equals: email, mode: "insensitive" } },
    });
    return agent?.id;
  } catch (err) {
    console.log(`${logPrefix} could not resolve agent for call ${callId}:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

/**
 * Turns one Zoom call-log entry (from either the webhook or the call
 * history REST API — both use the same field names) into a Call record on
 * the matching lead. Dedupes on Zoom's call_id, so it's safe to run the
 * same log through this twice (webhook + a later backfill, or two backfill
 * runs over an overlapping date range).
 */
export async function recordZoomCallLog(
  organizationId: string,
  log: Record<string, unknown>,
  logPrefix = "[zoom]"
): Promise<"recorded" | "skipped" | "duplicate"> {
  const callId = String(log.call_id ?? log.id ?? "");
  if (!callId) {
    console.log(`${logPrefix} skipped: no call_id/id in payload`, JSON.stringify(log).slice(0, 500));
    return "skipped";
  }

  const direction = mapDirection(log.direction);

  const existing = await prisma.call.findFirst({ where: { organizationId, externalId: callId } });
  if (existing) {
    if (!existing.agentId) {
      const agentId = await resolveAgentId(organizationId, direction, log, logPrefix, callId);
      if (agentId) await prisma.call.update({ where: { id: existing.id }, data: { agentId } });
    }
    return "duplicate";
  }

  const callerNumber = externalNumber(log, "caller");
  const calleeNumber = externalNumber(log, "callee");
  const customerNumber = direction === "OUTBOUND" ? calleeNumber : callerNumber;
  if (!customerNumber) {
    console.log(`${logPrefix} skipped: no caller/callee number for call ${callId}`, JSON.stringify(log).slice(0, 500));
    return "skipped";
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

  const agentId = await resolveAgentId(organizationId, direction, log, logPrefix, callId);

  const call = await prisma.call.create({
    data: {
      organizationId,
      leadId: lead.id,
      agentId,
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

  console.log(`${logPrefix} recorded call ${call.id} for lead ${lead.id}`);
  return "recorded";
}
