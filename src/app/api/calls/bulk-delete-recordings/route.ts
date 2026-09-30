import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { isAdmin } from "@/lib/access";

const schema = z.object({ callIds: z.array(z.string().min(1)).min(1).max(500) });

/**
 * Admin-only: delete many call recordings in one action, same idea as
 * bulk-assign for leads. Recordings are streamed from Zoom on demand, not
 * stored locally, so this just clears our own link to them — recordingDeleted
 * additionally stops a later Zoom sync from re-attaching them (see
 * recordZoomCallLog / DELETE /api/calls/[callId]/recording).
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!isAdmin(auth.session.role)) {
    return NextResponse.json({ error: "Only a Super Admin can delete call recordings" }, { status: 403 });
  }
  const { orgId } = auth.session;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await prisma.call.updateMany({
    where: { id: { in: parsed.data.callIds }, organizationId: orgId },
    data: { recordingUrl: null, recordingLogId: null, recordingDeleted: true },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
