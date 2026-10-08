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
 * month should count this month. "Won" counts initial sales (new projects
 * closed) that month; "revenue" sums every sale that month — initial wins
 * plus any upsells — each counted in the month it actually happened in,
 * not backdated to when the lead was first won.
 */
export async function getMonthlyPerformance(
  organizationId: string,
  sellerId: string,
  months = 12
): Promise<MonthlyPerformance[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const [assignedActivities, sales] = await Promise.all([
    prisma.activity.findMany({
      where: { organizationId, type: "LEAD_ASSIGNED", createdAt: { gte: start }, lead: { ownerId: sellerId } },
      select: { createdAt: true, leadId: true },
    }),
    prisma.sale.findMany({
      where: { organizationId, closedAt: { gte: start }, lead: { ownerId: sellerId } },
      select: { closedAt: true, amount: true, type: true },
    }),
  ]);

  const buckets = new Map<string, { assignedLeadIds: Set<string>; won: number; revenue: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.set(monthKey(d), { assignedLeadIds: new Set(), won: 0, revenue: 0 });
  }

  for (const a of assignedActivities) {
    buckets.get(monthKey(a.createdAt))?.assignedLeadIds.add(a.leadId);
  }
  for (const s of sales) {
    const bucket = buckets.get(monthKey(s.closedAt));
    if (!bucket) continue;
    bucket.revenue += Number(s.amount);
    if (s.type === "INITIAL") bucket.won += 1;
  }

  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, b]) => ({
      month: key,
      label: monthLabel(key),
      leadsAssigned: b.assignedLeadIds.size,
      won: b.won,
      revenue: b.revenue,
    }));
}

export type SoldLine = {
  leadId: string;
  clientName: string;
  type: "INITIAL" | "UPSELL";
  description: string | null;
  amount: number;
  closedAt: Date;
};

export type MonthlyRevenue = {
  month: string;
  label: string;
  totalRevenue: number;
  wonCount: number;
  projects: SoldLine[];
};

/**
 * Org-wide, month by month: every sale — an initial win or an upsell —
 * that closed that calendar month, with its value. The super admin's
 * "what did we actually close, start of month to end of month" view. An
 * upsell counts toward the month it was actually closed in, not the month
 * the lead was originally won, so growing an existing client's spend
 * shows up as revenue when it happens.
 */
export async function getMonthlyRevenue(organizationId: string, months = 12): Promise<MonthlyRevenue[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const sales = await prisma.sale.findMany({
    where: { organizationId, closedAt: { gte: start } },
    select: {
      closedAt: true,
      leadId: true,
      type: true,
      description: true,
      amount: true,
      lead: { select: { contact: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { closedAt: "desc" },
  });

  const buckets = new Map<string, { totalRevenue: number; wonCount: number; projects: SoldLine[] }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.set(monthKey(d), { totalRevenue: 0, wonCount: 0, projects: [] });
  }

  for (const s of sales) {
    const bucket = buckets.get(monthKey(s.closedAt));
    if (!bucket) continue;
    const amount = Number(s.amount);
    bucket.totalRevenue += amount;
    if (s.type === "INITIAL") bucket.wonCount += 1;
    bucket.projects.push({
      leadId: s.leadId,
      clientName: `${s.lead.contact.firstName} ${s.lead.contact.lastName ?? ""}`.trim(),
      type: s.type,
      description: s.description,
      amount,
      closedAt: s.closedAt,
    });
  }

  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, b]) => ({
      month: key,
      label: monthLabel(key),
      totalRevenue: b.totalRevenue,
      wonCount: b.wonCount,
      projects: b.projects,
    }));
}

export type MonthlyLeadEntry = { month: string; label: string; leadsAdded: number };

/**
 * Month-by-month count of leads a Lead Entry user has added, one row per
 * calendar month for the last `months` months (most recent first) —
 * counted by when the lead was created, since that's the only thing this
 * role actually does.
 */
export async function getMonthlyLeadEntry(
  organizationId: string,
  userId: string,
  months = 12
): Promise<MonthlyLeadEntry[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const leads = await prisma.lead.findMany({
    where: { organizationId, createdById: userId, createdAt: { gte: start } },
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
