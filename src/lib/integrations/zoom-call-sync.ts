import { prisma } from "@/lib/prisma";
import { findLeadForContact } from "@/lib/inbound";
import { logActivity } from "@/lib/timeline";
import { getPhoneUserEmail } from "@/lib/integrations/zoom";
import type { CallDirection, CallStatus } from "@prisma/client";

function recordingUrlFor(leadId: string | null | undefined, callId: string) {
  return leadId ? `/api/leads/${leadId}/calls/${callId}/recording` : `/api/calls/${callId}/recording`;
}

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
 * the matching lead. Dedupes on Zoom's call_id — but Zoom fires this event
 * twice per call (once from the caller's side, once from the callee's),
 * and the first one to arrive is often sent right as the call connects,
 * before duration/recording are final. So a duplicate isn't just skipped:
 * whichever event carries more complete data (longer duration, or a
 * recording the first one didn't have) updates the existing record.
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
  const durationSec = Number(log.duration ?? 0) || 0;
  const status = mapStatus(log.result, durationSec);
  const hasRecording = Boolean(log.recording_id ?? log.has_recording ?? log.recording_type);

  const existing = await prisma.call.findFirst({ where: { organizationId, externalId: callId } });
  if (existing) {
    const data: Record<string, unknown> = {};
    if (!existing.agentId) {
      const agentId = await resolveAgentId(organizationId, direction, log, logPrefix, callId);
      if (agentId) data.agentId = agentId;
    }
    if (durationSec > existing.durationSec) {
      data.durationSec = durationSec;
      data.status = status;
    }
    if (hasRecording && !existing.recordingUrl) {
      data.recordingUrl = recordingUrlFor(existing.leadId, existing.id);
    }
    if (Object.keys(data).length > 0) {
      await prisma.call.update({ where: { id: existing.id }, data });
      console.log(`${logPrefix} updated call ${existing.id} with more complete data`, JSON.stringify(data));
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

  // Only attach to a lead that already exists — unlike WhatsApp/SMS/email,
  // a Zoom call to/from a number with no matching lead shouldn't spawn one.
  // It still gets logged (visible on the Calls page), just with no lead.
  const lead = await findLeadForContact(organizationId, customerNumber);

  const dateTime = typeof log.date_time === "string" ? new Date(log.date_time) : new Date();
  const agentId = await resolveAgentId(organizationId, direction, log, logPrefix, callId);

  const call = await prisma.call.create({
    data: {
      organizationId,
      leadId: lead?.id,
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
      data: { recordingUrl: recordingUrlFor(lead?.id, call.id) },
    });
  }

  if (lead) {
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

  console.log(`${logPrefix} recorded call ${call.id}${lead ? ` for lead ${lead.id}` : " (no matching lead)"}`);
  return "recorded";
}
