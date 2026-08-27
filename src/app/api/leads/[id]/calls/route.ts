import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";
import { recalculateLeadScore } from "@/lib/scoring";
import { leadWhereForSession } from "@/lib/access";

const schema = z.object({
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  status: z.enum(["ANSWERED", "MISSED", "NO_ANSWER", "VOICEMAIL"]),
  durationSec: z.number().int().min(0).default(0),
  nextAction: z.string().optional(),
  aiSummary: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role === "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }
  const { id } = await params;
  const { orgId, sub } = auth.session;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId, ...leadWhereForSession(auth.session) },
    include: { contact: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const call = await prisma.call.create({
    data: {
      organizationId: orgId,
      leadId: id,
      agentId: sub,
      direction: data.direction,
      status: data.status,
      durationSec: data.durationSec,
      toNumber: data.direction === "OUTBOUND" ? lead.contact.phone : undefined,
      fromNumber: data.direction === "INBOUND" ? lead.contact.phone : undefined,
      nextAction: data.nextAction,
      aiSummary: data.aiSummary,
      startedAt: new Date(),
    },
  });

  const minutes = Math.floor(data.durationSec / 60);
  const seconds = data.durationSec % 60;
  await logActivity({
    organizationId: orgId,
    leadId: id,
    type: "CALL_LOGGED",
    summary: `📞 ${data.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call — ${data.status.toLowerCase()}${
      data.status === "ANSWERED" ? ` (${minutes}:${seconds.toString().padStart(2, "0")})` : ""
    }`,
    actorId: sub,
    metadata: { callId: call.id },
  });

  await recalculateLeadScore(id);

  return NextResponse.json({ call }, { status: 201 });
}
