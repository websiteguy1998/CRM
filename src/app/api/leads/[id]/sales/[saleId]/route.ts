import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { leadWhereForSession } from "@/lib/access";
import { updateSale, deleteSale } from "@/lib/sales";

const schema = z.object({
  amount: z.coerce.number().min(0.01).optional(),
  description: z.string().trim().min(1).optional(),
});

/**
 * Edit a sale that's already on the lead — correcting the amount on the
 * initial win or an upsell, or renaming what an upsell was, after the
 * fact. Same access as adding one: the lead's owner or a Super Admin.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; saleId: string }> }
) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role === "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }
  const { id, saleId } = await params;
  const { orgId } = auth.session;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId, ...leadWhereForSession(auth.session) },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sale = await prisma.sale.findFirst({ where: { id: saleId, leadId: id } });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.description !== undefined && sale.type === "INITIAL") {
    return NextResponse.json({ error: "The initial win doesn't have a description" }, { status: 400 });
  }

  const updated = await updateSale(prisma, saleId, parsed.data);
  return NextResponse.json({ sale: updated });
}

/**
 * Remove a sale entirely — the initial win or an upsell added by mistake.
 * Same access as editing one: the lead's owner or a Super Admin. Deleting
 * the only sale on the lead is allowed too — Lead.price then recalculates
 * down to null, same as it was before any sale was ever recorded.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; saleId: string }> }
) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role === "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }
  const { id, saleId } = await params;
  const { orgId } = auth.session;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId, ...leadWhereForSession(auth.session) },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sale = await prisma.sale.findFirst({ where: { id: saleId, leadId: id } });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteSale(prisma, saleId);
  return NextResponse.json({ ok: true });
}
