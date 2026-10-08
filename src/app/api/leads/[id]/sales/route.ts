import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { leadWhereForSession } from "@/lib/access";
import { recordUpsell } from "@/lib/sales";

const schema = z.object({
  description: z.string().trim().min(1, "Describe what was upsold"),
  amount: z.coerce.number().min(0.01, "Enter an amount"),
});

/** Every sale (initial + upsells) on a lead, newest first — for the lead detail page. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: auth.session.orgId, ...leadWhereForSession(auth.session) },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sales = await prisma.sale.findMany({ where: { leadId: id }, orderBy: { closedAt: "desc" } });
  return NextResponse.json({ sales });
}

/**
 * Add an upsell to a lead — any sale on top of the initial win, recorded
 * whenever it actually happens (not backdated to the original win), so
 * the Monthly revenue report attributes it to the month it was closed in.
 * Only the lead's owner or a Super Admin can add one; lead entry agents
 * have no reason to (they're excluded by leadWhereForSession already).
 */
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
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sale = await recordUpsell(prisma, {
    organizationId: orgId,
    leadId: id,
    description: parsed.data.description,
    amount: parsed.data.amount,
    createdById: sub,
  });

  return NextResponse.json({ sale });
}
