import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { leadWhereForSession } from "@/lib/access";
import { clickToCall } from "@/lib/integrations/zoom";
import { logActivity } from "@/lib/timeline";

/**
 * Rings the agent's own Zoom Phone device, which Zoom then bridges to the
 * lead's number once answered. The actual Call record with duration/status
 * gets created by the /api/webhooks/zoom handler once Zoom reports the
 * finished call log — this endpoint only kicks the call off.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role === "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }
  const { id } = await params;
  const { orgId, sub } = auth.session;

  const [lead, user] = await Promise.all([
    prisma.lead.findFirst({
      where: { id, organizationId: orgId, ...leadWhereForSession(auth.session) },
      include: { contact: true },
    }),
    prisma.user.findUnique({ where: { id: sub } }),
  ]);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!lead.contact.phone) {
    return NextResponse.json({ error: "This lead has no phone number on file" }, { status: 400 });
  }
  if (!user?.zoomUserEmail) {
    return NextResponse.json(
      { error: "Set your Zoom account email first — it's in the Call tab below." },
      { status: 400 }
    );
  }

  try {
    await clickToCall(orgId, user.zoomUserEmail, lead.contact.phone);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Call failed" }, { status: 502 });
  }

  await logActivity({
    organizationId: orgId,
    leadId: id,
    type: "CALL_LOGGED",
    summary: `📞 Click-to-call started via Zoom to ${lead.contact.phone}`,
    actorId: sub,
  });

  return NextResponse.json({ ok: true });
}
