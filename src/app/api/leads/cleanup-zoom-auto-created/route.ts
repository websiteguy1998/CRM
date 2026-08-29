import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

/**
 * One-time cleanup for leads that Zoom call sync auto-created before it
 * was changed to only attach to leads that already exist (see
 * findLeadForContact vs the old findOrCreateLeadForContact). Only removes
 * leads that are unambiguously untouched auto-creations: source is
 * exactly "Zoom Phone", nobody manually entered them, and none of the
 * sheet fields were ever filled in — anything an admin edited is left
 * alone. Calls that were attached to a removed lead aren't deleted, just
 * unlinked (leadId set to null), so call history/recordings survive on
 * the Calls page.
 */
export async function POST(_req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can run this cleanup" }, { status: 403 });
  }
  const { orgId } = auth.session;

  const source = await prisma.leadSource.findFirst({ where: { organizationId: orgId, name: "Zoom Phone" } });
  if (!source) {
    return NextResponse.json({ removed: 0, callsPreserved: 0 });
  }

  const candidates = await prisma.lead.findMany({
    where: {
      organizationId: orgId,
      sourceId: source.id,
      createdById: null,
      idName: null,
      idUrl: null,
      websiteUrl: null,
      country: null,
      deliveryDate: null,
      price: null,
      duration: null,
      statusNote: null,
      category: null,
    },
    select: { id: true, contactId: true },
  });

  let callsPreserved = 0;
  for (const lead of candidates) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.call.updateMany({ where: { leadId: lead.id }, data: { leadId: null } });
      callsPreserved += count;

      const conversations = await tx.conversation.findMany({ where: { leadId: lead.id }, select: { id: true } });
      const conversationIds = conversations.map((c) => c.id);
      if (conversationIds.length > 0) {
        await tx.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
        await tx.conversation.deleteMany({ where: { leadId: lead.id } });
      }

      await tx.leadStageHistory.deleteMany({ where: { leadId: lead.id } });
      await tx.leadTag.deleteMany({ where: { leadId: lead.id } });
      await tx.task.deleteMany({ where: { leadId: lead.id } });
      await tx.deal.deleteMany({ where: { leadId: lead.id } });
      await tx.note.deleteMany({ where: { leadId: lead.id } });
      await tx.activity.deleteMany({ where: { leadId: lead.id } });
      await tx.lead.delete({ where: { id: lead.id } });

      const otherLeads = await tx.lead.count({ where: { contactId: lead.contactId } });
      if (otherLeads === 0) {
        await tx.contact.delete({ where: { id: lead.contactId } });
      }
    });
  }

  return NextResponse.json({ removed: candidates.length, callsPreserved });
}
