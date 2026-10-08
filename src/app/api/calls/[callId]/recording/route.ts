import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { hasFullLeadVisibility, isAdmin } from "@/lib/access";
import { getCallRecordingDownloadInfo } from "@/lib/integrations/zoom";

/**
 * Same recording proxy as /api/leads/[id]/calls/[callId]/recording, for a
 * call that never matched an existing lead (so there's no lead to scope
 * the URL under). Full-visibility roles can play back any of these;
 * everyone else only their own (the agent who placed/received the call),
 * since there's no lead ownership to check against otherwise.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { callId } = await params;

  const call = await prisma.call.findFirst({ where: { id: callId, organizationId: auth.session.orgId, leadId: null } });
  if (!call?.externalId || call.recordingDeleted) {
    return NextResponse.json({ error: "No recording for this call" }, { status: 404 });
  }
  if (!hasFullLeadVisibility(auth.session.role) && call.agentId !== auth.session.sub) {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }

  const info = await getCallRecordingDownloadInfo(auth.session.homeOrgId, {
    callId: call.externalId,
    logId: call.recordingLogId,
  });
  if (!info) return NextResponse.json({ error: "Recording isn't available yet" }, { status: 404 });

  const audioRes = await fetch(info.url, { headers: { Authorization: `Bearer ${info.token}` } });
  if (!audioRes.ok || !audioRes.body) {
    return NextResponse.json({ error: "Could not fetch the recording from Zoom" }, { status: 502 });
  }

  return new NextResponse(audioRes.body, {
    headers: {
      "Content-Type": audioRes.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

/**
 * Super Admin only: permanently remove a call recording. We never store the
 * audio ourselves (it's streamed live from Zoom via the GET above), so this
 * just revokes our own access to it — recordingDeleted also stops a later
 * Zoom webhook/backfill sync from re-attaching it (see recordZoomCallLog).
 * Works for any call regardless of whether it's tied to a lead.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!isAdmin(auth.session.role)) {
    return NextResponse.json({ error: "Only a Super Admin can delete call recordings" }, { status: 403 });
  }
  const { callId } = await params;

  const call = await prisma.call.findFirst({ where: { id: callId, organizationId: auth.session.orgId } });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.call.update({
    where: { id: callId },
    data: { recordingUrl: null, recordingLogId: null, recordingDeleted: true },
  });

  return NextResponse.json({ ok: true });
}
