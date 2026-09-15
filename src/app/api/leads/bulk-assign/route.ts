import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";

const schema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(500),
  ownerId: z.string().min(1),
});

/** Admin-only: allocate many leads to one seller in a single action. */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only a Super Admin can bulk-assign leads" }, { status: 403 });
  }
  const { orgId, sub } = auth.session;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { leadIds, ownerId } = parsed.data;

  const owner = await prisma.user.findFirst({ where: { id: ownerId, organizationId: orgId } });
  if (!owner) return NextResponse.json({ error: "Seller not found" }, { status: 400 });

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, organizationId: orgId },
    select: { id: true, ownerId: true },
  });
  const changedIds = leads.filter((l) => l.ownerId !== ownerId).map((l) => l.id);

  if (changedIds.length > 0) {
    await prisma.lead.updateMany({ where: { id: { in: changedIds } }, data: { ownerId } });
    for (const leadId of changedIds) {
      await logActivity({
        organizationId: orgId,
        leadId,
        type: "LEAD_ASSIGNED",
        summary: `Allocated to ${owner.name}`,
        actorId: sub,
      });
    }
  }

  return NextResponse.json({ ok: true, updated: changedIds.length, unchanged: leads.length - changedIds.length });
}
