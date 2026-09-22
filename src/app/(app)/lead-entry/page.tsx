import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import { relativeTime } from "@/lib/format";
import { isAdmin } from "@/lib/access";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

type Stats = {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  unassigned: number;
  lastAddedAt: Date | null;
};

export default async function LeadEntryPage() {
  const session = await getSession();
  if (!session) return null;
  if (!isAdmin(session.role)) return null;

  const users = await prisma.user.findMany({
    where: { organizationId: session.orgId, role: "LEAD_ENTRY" },
    orderBy: { name: "asc" },
  });

  const leads = await prisma.lead.findMany({
    where: { organizationId: session.orgId, createdById: { in: users.map((u) => u.id) } },
    select: { createdById: true, createdAt: true, ownerId: true },
  });

  const today = startOfToday();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = startOfMonth();

  const statsByUser = new Map<string, Stats>();
  for (const lead of leads) {
    const key = lead.createdById as string;
    const s = statsByUser.get(key) ?? {
      total: 0,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      unassigned: 0,
      lastAddedAt: null,
    };
    s.total += 1;
    if (lead.createdAt >= today) s.today += 1;
    if (lead.createdAt >= weekAgo) s.thisWeek += 1;
    if (lead.createdAt >= monthStart) s.thisMonth += 1;
    if (!lead.ownerId) s.unassigned += 1;
    if (!s.lastAddedAt || lead.createdAt > s.lastAddedAt) s.lastAddedAt = lead.createdAt;
    statsByUser.set(key, s);
  }
  const empty: Stats = { total: 0, today: 0, thisWeek: 0, thisMonth: 0, unassigned: 0, lastAddedAt: null };

  return (
    <div>
      <PageHeader title="Lead Entry" description={`${users.length} lead entry agents`} />
      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] text-slate-500">
                <th className="w-40 px-2.5 py-1.5 font-medium">Name</th>
                <th className="w-48 px-2.5 py-1.5 font-medium">Email</th>
                <th className="w-20 px-2.5 py-1.5 font-medium">Status</th>
                <th className="w-16 px-2.5 py-1.5 font-medium">Today</th>
                <th className="w-20 px-2.5 py-1.5 font-medium">This week</th>
                <th className="w-24 px-2.5 py-1.5 font-medium">This month</th>
                <th className="w-24 px-2.5 py-1.5 font-medium">Total added</th>
                <th className="w-24 px-2.5 py-1.5 font-medium">Unassigned</th>
                <th className="w-28 px-2.5 py-1.5 font-medium">Last added</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const s = statsByUser.get(u.id) ?? empty;
                return (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="truncate px-2.5 py-1.5 font-medium text-slate-800">
                      <Link href={`/lead-entry/${u.id}`} className="hover:underline">
                        {u.name}
                      </Link>
                    </td>
                    <td className="truncate px-2.5 py-1.5 text-slate-600">{u.email}</td>
                    <td className="px-2.5 py-1.5">
                      <span
                        className={`badge ${
                          u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {u.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 font-medium text-indigo-600">{s.today}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{s.thisWeek}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{s.thisMonth}</td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-800">{s.total}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{s.unassigned}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-400">
                      {s.lastAddedAt ? relativeTime(s.lastAddedAt) : "—"}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-2.5 py-10 text-center text-slate-400">
                    No lead entry agents yet. Add one from Settings → Users & roles.
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
