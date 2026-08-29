import { prisma } from "@/lib/prisma";
import { findLeadForContact } from "@/lib/inbound";
import { logActivity } from "@/lib/timeline";
import { getZoomUserInfo, fetchCallHistory } from "@/lib/integrations/zoom";
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

/** Zoom's REST call-history endpoint reports duration as "HH:MM:SS" (or "MM:SS"); the webhook sends a raw second count. Handle both. */
function parseDurationSeconds(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  if (typeof raw !== "string") return 0;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":").map(Number);
  if (parts.length > 1 && parts.every((p) => Number.isFinite(p))) {
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  return 0;
}

const PHONE_LIKE = /^\+?[\d\s().-]{7,20}$/;

/**
 * Zoom's exact field name for the external party's phone number has
 * turned out to vary (did_number on one payload shape, something else on
 * another) — rather than keep chasing exact names, scan every
 * "<side>_*" field for one whose value actually looks like a phone
 * number, skipping <side>_ext_number specifically since that's the
 * internal extension (e.g. "800"), not a customer's number.
 */
function externalNumber(log: Record<string, unknown>, side: "caller" | "callee"): string | undefined {
  const prefix = `${side}_`;
  for (const [key, value] of Object.entries(log)) {
    if (!key.startsWith(prefix) || key === `${prefix}ext_number`) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length >= 7 && PHONE_LIKE.test(trimmed)) return trimmed;
  }
  return undefined;
}

/** Same reasoning as externalNumber — scan for any recording-shaped field instead of guessing its exact name. */
function hasRecording(log: Record<string, unknown>): boolean {
  return Object.entries(log).some(
    ([key, value]) => /recording/i.test(key) && Boolean(value) && value !== "false" && value !== "0"
  );
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
    const { email, phoneNumber } = await getZoomUserInfo(organizationId, agentZoomUserId);
    if (!email) return undefined;
    const agent = await prisma.user.findFirst({
      where: { organizationId, zoomUserEmail: { equals: email, mode: "insensitive" } },
    });
    if (agent && phoneNumber && agent.zoomPhoneNumber !== phoneNumber) {
      await prisma.user.update({ where: { id: agent.id }, data: { zoomPhoneNumber: phoneNumber } });
    }
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
): Promise<"recorded" | "skipped" | "updated" | "unchanged"> {
  const callId = String(log.call_id ?? log.id ?? "");
  if (!callId) {
    console.log(`${logPrefix} skipped: no call_id/id in payload`, JSON.stringify(log).slice(0, 500));
    return "skipped";
  }

  const direction = mapDirection(log.direction);
  const durationSec = parseDurationSeconds(log.duration);
  const status = mapStatus(log.result, durationSec);
  const recorded = hasRecording(log);

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
    if (recorded && !existing.recordingUrl) {
      data.recordingUrl = recordingUrlFor(existing.leadId, existing.id);
    }
    if (Object.keys(data).length > 0) {
      await prisma.call.update({ where: { id: existing.id }, data });
      console.log(`${logPrefix} updated call ${existing.id} with more complete data`, JSON.stringify(data));
      return "updated";
    }
    return "unchanged";
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

  if (recorded) {
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

/**
 * Pulls Zoom's call history for the last `days` days and runs every entry
 * through recordZoomCallLog. Used both for the admin's manual "Import past
 * calls" (a large window) and a lightweight recent-window sync that runs
 * automatically when someone opens the Calls page — Zoom's webhook often
 * fires the moment a call connects, before duration/recording are final,
 * and (on at least some accounts) never fires again once they are, so
 * without this a fresh call can get stuck showing 0:00 with no recording
 * until someone happens to re-pull it from the REST API, which has the
 * finished data a little after the call ends.
 */
export async function syncZoomCallHistory(organizationId: string, days: number, logPrefix: string) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const logs = await fetchCallHistory(organizationId, {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });

  const tally = { recorded: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const log of logs) {
    const outcome = await recordZoomCallLog(organizationId, log, logPrefix);
    tally[outcome] += 1;
  }
  return { total: logs.length, ...tally };
}
