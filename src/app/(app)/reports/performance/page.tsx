import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import { formatCurrency } from "@/lib/format";
import { LEAD_CATEGORY_LABELS, type LeadCategoryValue } from "@/lib/categories";

type Bucket = {
  sellerId: string;
  category: LeadCategoryValue | null;
  totalLeads: number;
  won: number;
  totalCalls: number;
  answeredCalls: number;
  revenue: number;
};

function bucketKey(sellerId: string, category: LeadCategoryValue | null) {
  return `${sellerId}::${category ?? "none"}`;
}

function categoryLabel(category: LeadCategoryValue | null) {
  return category ? LEAD_CATEGORY_LABELS[category] : "Uncategorized";
}

export default async function PerformancePage() {
  const session = await getSession();
  if (!session) return null;
  const orgId = session.orgId;

  const [sellers, leads, calls] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId, role: { in: ["AGENT", "MANAGER"] } },
      orderBy: { name: "asc" },
    }),
    prisma.lead.findMany({
      where: { organizationId: orgId, ownerId: { not: null } },
      select: { ownerId: true, category: true, status: true, price: true },
    }),
    prisma.call.findMany({
      where: { organizationId: orgId, lead: { ownerId: { not: null } } },
      select: { status: true, lead: { select: { ownerId: true, category: true } } },
    }),
  ]);

  const buckets = new Map<string, Bucket>();
  for (const lead of leads) {
    const ownerId = lead.ownerId as string;
    const key = bucketKey(ownerId, lead.category);
    const b = buckets.get(key) ?? {
      sellerId: ownerId,
      category: lead.category,
      totalLeads: 0,
      won: 0,
      totalCalls: 0,
      answeredCalls: 0,
      revenue: 0,
    };
    b.totalLeads += 1;
    if (lead.status === "WON") {
      b.won += 1;
      b.revenue += lead.price != null ? Number(lead.price) : 0;
    }
    buckets.set(key, b);
  }
  for (const call of calls) {
    const ownerId = call.lead?.ownerId;
    if (!ownerId) continue;
    const key = bucketKey(ownerId, call.lead?.category ?? null);
    const b = buckets.get(key);
    if (!b) continue;
    b.totalCalls += 1;
    if (call.status === "ANSWERED") b.answeredCalls += 1;
  }

  const sellerNames = new Map(sellers.map((s) => [s.id, s.name]));
  const rows = Array.from(buckets.values()).filter((b) => sellerNames.has(b.sellerId));

  // "Best fit" per category — the seller with the highest win rate for that
  // lead type, among sellers with enough leads of it to mean something.
  const MIN_LEADS_FOR_BEST_FIT = 3;
  const categoriesPresent = Array.from(new Set(rows.map((r) => r.category)));
  const bestFits = categoriesPresent
    .map((category) => {
      const candidates = rows.filter((r) => r.category === category && r.totalLeads >= MIN_LEADS_FOR_BEST_FIT);
      if (candidates.length === 0) return null;
      const best = candidates.reduce((a, b) => (b.won / b.totalLeads > a.won / a.totalLeads ? b : a));
      return { category, seller: sellerNames.get(best.sellerId) ?? "—", bucket: best };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category)));

  const sortedRows = rows.sort((a, b) => {
    const nameCompare = (sellerNames.get(a.sellerId) ?? "").localeCompare(sellerNames.get(b.sellerId) ?? "");
    if (nameCompare !== 0) return nameCompare;
    return b.totalLeads - a.totalLeads;
  });

  return (
    <div className="pb-10">
      <PageHeader
        title="Performance"
        description="Which lead types are converting best with which seller."
      />
      <div className="space-y-6 p-6">
        {bestFits.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Best fit by lead type</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bestFits.map(({ category, seller, bucket }) => (
                <div key={category ?? "none"} className="card p-4">
                  <p className="text-xs font-medium text-slate-500">{categoryLabel(category)}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{seller}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {((bucket.won / bucket.totalLeads) * 100).toFixed(0)}% win rate · {bucket.totalLeads} leads
                    {bucket.won > 0 ? ` · ${formatCurrency(bucket.revenue / bucket.won)} avg deal` : ""}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Only shown for a seller/type pair with at least {MIN_LEADS_FOR_BEST_FIT} leads, so one lucky close
              doesn't look like a pattern.
            </p>
          </div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] text-slate-500">
                <th className="px-3 py-2 font-medium">Seller</th>
                <th className="px-3 py-2 font-medium">Lead type</th>
                <th className="px-3 py-2 font-medium">Leads</th>
                <th className="px-3 py-2 font-medium">Won</th>
                <th className="px-3 py-2 font-medium">Win rate</th>
                <th className="px-3 py-2 font-medium">Calls</th>
                <th className="px-3 py-2 font-medium">Answered</th>
                <th className="px-3 py-2 font-medium">Answer rate</th>
                <th className="px-3 py-2 font-medium">Avg deal</th>
                <th className="px-3 py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const winRate = r.totalLeads ? (r.won / r.totalLeads) * 100 : 0;
                const answerRate = r.totalCalls ? (r.answeredCalls / r.totalCalls) * 100 : 0;
                return (
                  <tr
                    key={bucketKey(r.sellerId, r.category)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-1.5 font-medium text-slate-800">{sellerNames.get(r.sellerId)}</td>
                    <td className="px-3 py-1.5 text-slate-600">{categoryLabel(r.category)}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.totalLeads}</td>
                    <td className="px-3 py-1.5 text-emerald-700">{r.won}</td>
                    <td className="px-3 py-1.5 text-slate-600">{winRate.toFixed(0)}%</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.totalCalls}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.answeredCalls}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.totalCalls ? `${answerRate.toFixed(0)}%` : "—"}</td>
                    <td className="px-3 py-1.5 text-slate-600">
                      {r.won ? formatCurrency(r.revenue / r.won) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{formatCurrency(r.revenue)}</td>
                  </tr>
                );
              })}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                    No categorized, assigned leads yet — this fills in as leads get a category and a seller.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
