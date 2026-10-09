import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Lead.price is kept as the running total of every Sale on the lead (the
 * initial win plus every upsell since), so the "won value" numbers already
 * shown everywhere else (seller profile, dashboard leaderboard, Sellers
 * list, Reports top stats) pick up upsells automatically without those
 * call sites needing to change. Call this after any Sale insert/update.
 */
export async function recalculateLeadPrice(db: Db, leadId: string) {
  const agg = await db.sale.aggregate({ where: { leadId }, _sum: { amount: true } });
  await db.lead.update({
    where: { id: leadId },
    data: { price: agg._sum.amount ?? null },
  });
}

/**
 * Records (or corrects) the initial sale on a lead — the amount a seller
 * enters when marking it Won, or later edits via the lead detail page.
 * A lead only ever has one INITIAL sale; re-winning it (or editing the
 * price afterward) updates that same row instead of creating another,
 * so "how much did this close for" stays a single, correctable number
 * while upsells stay additive on top of it.
 */
export async function recordInitialSale(
  db: Db,
  params: { organizationId: string; leadId: string; amount: number; createdById?: string | null; closedAt?: Date }
) {
  const existing = await db.sale.findFirst({ where: { leadId: params.leadId, type: "INITIAL" } });
  if (existing) {
    await db.sale.update({
      where: { id: existing.id },
      data: { amount: params.amount },
    });
  } else {
    await db.sale.create({
      data: {
        organizationId: params.organizationId,
        leadId: params.leadId,
        type: "INITIAL",
        amount: params.amount,
        closedAt: params.closedAt ?? new Date(),
        createdById: params.createdById ?? undefined,
      },
    });
  }
  await recalculateLeadPrice(db, params.leadId);
}

/**
 * Edits an existing sale in place — amount on any sale, description on an
 * upsell (an INITIAL sale's description stays null; it's just "the deal",
 * not a named line item). Used by the Sales panel's per-row edit.
 */
export async function updateSale(
  db: Db,
  saleId: string,
  changes: { amount?: number; description?: string }
) {
  const sale = await db.sale.update({
    where: { id: saleId },
    data: {
      ...(changes.amount !== undefined ? { amount: changes.amount } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
    },
  });
  await recalculateLeadPrice(db, sale.leadId);
  return sale;
}

/**
 * Removes a sale that was added by mistake — an upsell that didn't
 * actually happen, or an initial win recorded wrong and re-entered as a
 * fresh row. Lead.price is recalculated straight after, same as any other
 * Sale change, so the lead's running total (and every revenue view built
 * on top of it) drops this amount immediately.
 */
export async function deleteSale(db: Db, saleId: string) {
  const sale = await db.sale.delete({ where: { id: saleId } });
  await recalculateLeadPrice(db, sale.leadId);
  return sale;
}

/** Adds a new upsell — always a new line, since a lead can have several over time. */
export async function recordUpsell(
  db: Db,
  params: {
    organizationId: string;
    leadId: string;
    description: string;
    amount: number;
    createdById?: string | null;
  }
) {
  // A lead can be WON with a price already on it but no INITIAL sale row
  // behind it yet — either it predates the Sale ledger, or it was won via
  // "Skip for now" with no amount entered at the time. recalculateLeadPrice
  // below only sums actual Sale rows, so without this, adding an upsell
  // would silently wipe that pre-existing won value instead of adding on
  // top of it. Back it into an INITIAL sale first so it's preserved.
  const hasAnySale = await db.sale.findFirst({ where: { leadId: params.leadId } });
  if (!hasAnySale) {
    const lead = await db.lead.findUnique({ where: { id: params.leadId }, select: { price: true } });
    if (lead?.price != null) {
      await db.sale.create({
        data: {
          organizationId: params.organizationId,
          leadId: params.leadId,
          type: "INITIAL",
          amount: lead.price,
        },
      });
    }
  }

  const sale = await db.sale.create({
    data: {
      organizationId: params.organizationId,
      leadId: params.leadId,
      type: "UPSELL",
      description: params.description,
      amount: params.amount,
      createdById: params.createdById ?? undefined,
    },
  });
  await recalculateLeadPrice(db, params.leadId);
  return sale;
}
