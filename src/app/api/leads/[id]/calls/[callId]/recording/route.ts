import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { leadWhereForSession } from "@/lib/access";
import { getCallRecordingDownloadInfo } from "@/lib/integrations/zoom";

/**
 * Streams a Zoom Phone call recording through our own server. Zoom's
 * recording download URLs require the same OAuth bearer token used to
 * fetch them, so the browser can't play them directly — this route fetches
 * the audio server-side (re-authenticating on every request, since Zoom's
 * download URLs expire) and forwards the bytes.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; callId: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role === "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }
  const { id, callId } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: auth.session.orgId, ...leadWhereForSession(auth.session) },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const call = await prisma.call.findFirst({ where: { id: callId, leadId: id } });
  if (!call?.externalId) return NextResponse.json({ error: "No recording for this call" }, { status: 404 });

  const info = await getCallRecordingDownloadInfo(auth.session.orgId, call.externalId);
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
