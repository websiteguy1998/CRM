import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";
import { recalculateLeadScore } from "@/lib/scoring";
import { leadWhereForSession } from "@/lib/access";
import { recordInitialSale, recordUpsell } from "@/lib/sales";

const schema = z
  .object({
    stageId: z.string().min(1),
    // Set together with the stage move so marking a lead Won and recording
    // what it closed for happens in one save instead of two — see the
    // win-amount prompt in StageSelector.
    price: z.coerce.number().min(0).optional(),
    // Optional, filled in at the same moment if there's already an upsell
    // alongside the initial win (e.g. "$1500 for the site + $500 SEO
    // upsell") — both land as separate Sale rows in one request.
    upsellDescription: z.string().trim().min(1).optional(),
    upsellAmount: z.coerce.number().min(0).optional(),
  })
  .refine((v) => !v.upsellAmount || v.upsellDescription, {
    message: "Describe the upsell",
    path: ["upsellDescription"],
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role === "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }
  const { id } = await params;
  const { orgId, sub } = auth.session;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId, ...leadWhereForSession(auth.session) },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newStage = await prisma.pipelineStage.findFirst({
    where: { id: parsed.data.stageId, pipeline: { organizationId: orgId } },
  });
  if (!newStage) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });

  await prisma.lead.update({
    where: { id },
    data: {
      stageId: newStage.id,
      status: newStage.isWon ? "WON" : newStage.isLost ? "LOST" : "OPEN",
    },
  });

  if (parsed.data.price !== undefined) {
    await recordInitialSale(prisma, { organizationId: orgId, leadId: id, amount: parsed.data.price, createdById: sub });
  }
  if (parsed.data.upsellAmount && parsed.data.upsellDescription) {
    await recordUpsell(prisma, {
      organizationId: orgId,
      leadId: id,
      description: parsed.data.upsellDescription,
      amount: parsed.data.upsellAmount,
      createdById: sub,
    });
  }

  const updated = await prisma.lead.findUniqueOrThrow({ where: { id }, include: { stage: true } });

  await prisma.leadStageHistory.create({
    data: {
      leadId: id,
      fromStageId: lead.stageId,
      toStageId: newStage.id,
      changedById: sub,
    },
  });

  await logActivity({
    organizationId: orgId,
    leadId: id,
    type: "STAGE_CHANGED",
    summary: `Stage changed to ${newStage.name}`,
    actorId: sub,
  });

  if (newStage.isWon) {
    await prisma.deal.updateMany({
      where: { leadId: id, status: "OPEN" },
      data: { status: "WON", closedAt: new Date() },
    });
  } else if (newStage.isLost) {
    await prisma.deal.updateMany({
      where: { leadId: id, status: "OPEN" },
      data: { status: "LOST", closedAt: new Date() },
    });
  }

  await recalculateLeadScore(id);

  return NextResponse.json({ lead: updated });
}
