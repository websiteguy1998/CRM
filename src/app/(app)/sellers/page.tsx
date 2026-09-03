import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import { formatCurrency } from "@/lib/format";

type SellerStats = {
  total: number;
  open: number;
  won: number;
  lost: number;
  nurture: number;
  wonValue: number;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function SellersPage() {
  const session = await getSession();
  if (!session) return null;

  const [sellers, ownedLeads, assignedToday] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.orgId, role: { in: ["AGENT", "MANAGER"] } },
      orderBy: { name: "asc" },
    }),
    prisma.lead.findMany({
      where: { organizationId: session.orgId, ownerId: { not: null } },
      select: { ownerId: true, status: true, price: true },
    }),
    // "Today" = distinct leads allocated to their current owner today, same
    // definition the dashboard uses for "Assigned to you today" — not just
    // leads created today, since an older lead handed out today should
    // count too. Grouped by distinct lead id, not raw activity count, so a
    // lead reassigned back and forth the same day isn't counted twice.
    prisma.activity.findMany({
      where: {
        organizationId: session.orgId,
        type: "LEAD_ASSIGNED",
        createdAt: { gte: startOfToday() },
        lead: { ownerId: { not: null } },
      },
      select: { leadId: true, lead: { select: { ownerId: true } } },
    }),
  ]);

  const statsByOwner = new Map<string, SellerStats>();
  for (const lead of ownedLeads) {
    const key = lead.ownerId as string;
    const s = statsByOwner.get(key) ?? { total: 0, open: 0, won: 0, lost: 0, nurture: 0, wonValue: 0 };
    s.total += 1;
    if (lead.status === "OPEN") s.open += 1;
    if (lead.status === "NURTURE") s.nurture += 1;
    if (lead.status === "LOST") s.lost += 1;
    if (lead.status === "WON") {
      s.won += 1;
      s.wonValue += lead.price != null ? Number(lead.price) : 0;
    }
    statsByOwner.set(key, s);
  }
  const empty: SellerStats = { total: 0, open: 0, won: 0, lost: 0, nurture: 0, wonValue: 0 };

  const todayLeadsByOwner = new Map<string, Set<string>>();
  for (const a of assignedToday) {
    const owner = a.lead?.ownerId;
    if (!owner) continue;
    const set = todayLeadsByOwner.get(owner) ?? new Set<string>();
    set.add(a.leadId);
    todayLeadsByOwner.set(owner, set);
  }

  return (
    <div>
      <PageHeader title="Sellers" description={`${sellers.length} sellers`} />
      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1000px] table-fixed text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] text-slate-500">
                <th className="w-40 px-2.5 py-1.5 font-medium">Seller</th>
                <th className="w-48 px-2.5 py-1.5 font-medium">Email</th>
                <th className="w-20 px-2.5 py-1.5 font-medium">Role</th>
                <th className="w-20 px-2.5 py-1.5 font-medium">Status</th>
                <th className="w-16 px-2.5 py-1.5 font-medium">Today</th>
                <th className="w-24 px-2.5 py-1.5 font-medium">Total leads</th>
                <th className="w-16 px-2.5 py-1.5 font-medium">Open</th>
                <th className="w-16 px-2.5 py-1.5 font-medium">Won</th>
                <th className="w-16 px-2.5 py-1.5 font-medium">Lost</th>
                <th className="w-16 px-2.5 py-1.5 font-medium">Nurture</th>
                <th className="w-24 px-2.5 py-1.5 font-medium">Won value</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((seller) => {
                const s = statsByOwner.get(seller.id) ?? empty;
                const today = todayLeadsByOwner.get(seller.id)?.size ?? 0;
                return (
                  <tr key={seller.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="truncate px-2.5 py-1.5 font-medium text-slate-800">
                      <Link href={`/sellers/${seller.id}`} className="hover:underline">
                        {seller.name}
                      </Link>
                    </td>
                    <td className="truncate px-2.5 py-1.5 text-slate-600">{seller.email}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-600">{seller.role}</td>
                    <td className="px-2.5 py-1.5">
                      <span
                        className={`badge ${
                          seller.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {seller.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 font-medium text-indigo-600">{today}</td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-800">{s.total}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{s.open}</td>
                    <td className="px-2.5 py-1.5 text-emerald-700">{s.won}</td>
                    <td className="px-2.5 py-1.5 text-rose-600">{s.lost}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{s.nurture}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-600">{formatCurrency(s.wonValue)}</td>
                  </tr>
                );
              })}
              {sellers.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-2.5 py-10 text-center text-slate-400">
                    No sellers yet. Add one from Settings → Users & roles.
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
