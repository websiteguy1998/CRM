import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";
import { isAdmin, leadWhereForSession } from "@/lib/access";
import { normalizeIdentifyingField } from "@/lib/duplicate-lead";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: auth.session.orgId, ...leadWhereForSession(auth.session) },
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
  idName: z.string().optional(),
  idUrl: z.string().optional(),
  country: z.string().optional(),
  websiteUrl: z.string().optional(),
  deliveryDate: z.string().optional(),
  price: z.coerce.number().optional(),
  duration: z.string().optional(),
  statusNote: z.string().optional(),
  category: z.enum(["WEB_DEVELOPMENT", "GRAPHIC_DESIGN", "UI_DESIGN", "SEO", "SMM"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { orgId } = auth.session;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId, ...leadWhereForSession(auth.session) },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.ownerId && !isAdmin(auth.session.role)) {
    return NextResponse.json({ error: "Only a Super Admin can allocate leads" }, { status: 403 });
  }

  const { deliveryDate, idUrl, websiteUrl, ...rest } = parsed.data;
  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ...rest,
      ...(idUrl !== undefined ? { idUrl: normalizeIdentifyingField(idUrl) ?? null } : {}),
      ...(websiteUrl !== undefined ? { websiteUrl: normalizeIdentifyingField(websiteUrl) ?? null } : {}),
      ...(deliveryDate ? { deliveryDate: new Date(deliveryDate) } : {}),
    },
    include: { contact: true, owner: true },
  });

  if (parsed.data.ownerId && parsed.data.ownerId !== lead.ownerId) {
    await logActivity({
      organizationId: orgId,
      leadId: id,
      type: "LEAD_ASSIGNED",
      summary: `Allocated to ${updated.owner?.name}`,
      actorId: auth.session.sub,
    });
  }

  return NextResponse.json({ lead: updated });
}

/**
 * Admin-only: permanently delete a lead. Calls aren't deleted — just
 * unlinked (leadId set to null) — so call history/recordings survive on
 * the Calls page even after the lead they were on is removed. The contact
 * is dropped too if this was its only lead.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!isAdmin(auth.session.role)) {
    return NextResponse.json({ error: "Only a Super Admin can delete leads" }, { status: 403 });
  }
  const { id } = await params;
  const { orgId } = auth.session;

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: orgId } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.call.updateMany({ where: { leadId: id }, data: { leadId: null } });

    const conversations = await tx.conversation.findMany({ where: { leadId: id }, select: { id: true } });
    const conversationIds = conversations.map((c) => c.id);
    if (conversationIds.length > 0) {
      await tx.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await tx.conversation.deleteMany({ where: { leadId: id } });
    }

    await tx.leadStageHistory.deleteMany({ where: { leadId: id } });
    await tx.leadTag.deleteMany({ where: { leadId: id } });
    await tx.task.deleteMany({ where: { leadId: id } });
    await tx.deal.deleteMany({ where: { leadId: id } });
    await tx.note.deleteMany({ where: { leadId: id } });
    await tx.activity.deleteMany({ where: { leadId: id } });
    await tx.lead.delete({ where: { id } });

    const otherLeads = await tx.lead.count({ where: { contactId: lead.contactId } });
    if (otherLeads === 0) {
      await tx.contact.delete({ where: { id: lead.contactId } });
    }
  });

  return NextResponse.json({ ok: true });
}
