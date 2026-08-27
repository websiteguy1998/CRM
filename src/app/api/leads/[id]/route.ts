import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: auth.session.orgId },
    include: {
      contact: true,
      company: true,
      stage: true,
      pipeline: { include: { stages: { orderBy: { order: "asc" } } } },
      owner: true,
      source: true,
      campaign: true,
      tags: { include: { tag: true } },
    },
  });

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

const patchSchema = z.object({
  ownerId: z.string().optional(),
  status: z.enum(["OPEN", "WON", "LOST", "NURTURE"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { orgId } = auth.session;

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: orgId } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.lead.update({
    where: { id },
    data: parsed.data,
    include: { contact: true, owner: true },
  });

  if (parsed.data.ownerId && parsed.data.ownerId !== lead.ownerId) {
    await logActivity({
      organizationId: orgId,
      leadId: id,
      type: "LEAD_ASSIGNED",
      summary: `Reassigned to ${updated.owner?.name}`,
      actorId: auth.session.sub,
    });
  }

  return NextResponse.json({ lead: updated });
}
