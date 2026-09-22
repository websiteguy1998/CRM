import { prisma } from "@/lib/prisma";

export type MonthlyPerformance = {
  month: string;
  label: string;
  leadsAssigned: number;
  won: number;
  revenue: number;
};

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * Month-by-month record for one seller: how many leads were assigned to
 * them and how much revenue they closed, one row per calendar month for
 * the last `months` months (most recent first). "Assigned" counts a lead
 * in the month it was actually handed to them (via the LEAD_ASSIGNED
 * activity), not the month it was created — an older lead reassigned this
 * month should count this month. "Revenue" counts a lead's price in the
 * month its stage became a Won stage (LeadStageHistory), deduped per lead
 * per month so a reopen-then-rewin in the same month isn't double counted.
 */
export async function getMonthlyPerformance(sellerId: string, months = 12): Promise<MonthlyPerformance[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const [assignedActivities, wonHistory] = await Promise.all([
    prisma.activity.findMany({
      where: { type: "LEAD_ASSIGNED", createdAt: { gte: start }, lead: { ownerId: sellerId } },
      select: { createdAt: true, leadId: true },
    }),
    prisma.leadStageHistory.findMany({
      where: { changedAt: { gte: start }, toStage: { isWon: true }, lead: { ownerId: sellerId } },
      select: { changedAt: true, leadId: true, lead: { select: { price: true } } },
    }),
  ]);

  const buckets = new Map<string, { assignedLeadIds: Set<string>; wonLeadIds: Set<string>; revenue: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.set(monthKey(d), { assignedLeadIds: new Set(), wonLeadIds: new Set(), revenue: 0 });
  }

  for (const a of assignedActivities) {
    buckets.get(monthKey(a.createdAt))?.assignedLeadIds.add(a.leadId);
  }
  for (const h of wonHistory) {
    const bucket = buckets.get(monthKey(h.changedAt));
    if (bucket && !bucket.wonLeadIds.has(h.leadId)) {
      bucket.wonLeadIds.add(h.leadId);
      bucket.revenue += h.lead.price != null ? Number(h.lead.price) : 0;
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, b]) => ({
      month: key,
      label: monthLabel(key),
      leadsAssigned: b.assignedLeadIds.size,
      won: b.wonLeadIds.size,
      revenue: b.revenue,
    }));
}

export type MonthlyLeadEntry = { month: string; label: string; leadsAdded: number };

/**
 * Month-by-month count of leads a Lead Entry user has added, one row per
 * calendar month for the last `months` months (most recent first) —
 * counted by when the lead was created, since that's the only thing this
 * role actually does.
 */
export async function getMonthlyLeadEntry(userId: string, months = 12): Promise<MonthlyLeadEntry[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const leads = await prisma.lead.findMany({
    where: { createdById: userId, createdAt: { gte: start } },
    select: { createdAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.set(monthKey(d), 0);
  }
  for (const lead of leads) {
    const key = monthKey(lead.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, count]) => ({ month: key, label: monthLabel(key), leadsAdded: count }));
}
