import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import { formatCurrency, relativeTime } from "@/lib/format";
import Link from "next/link";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;
  const orgId = session.orgId;
  const today = startOfToday();

  const [
    newLeadsToday,
    contactedToday,
    conversationsToday,
    callsToday,
    followUpsDue,
    dealsWon,
    revenueAgg,
    totalOpenLeads,
    overdueTasks,
    hotLeads,
    recentActivities,
    agents,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId: orgId, createdAt: { gte: today } } }),
    prisma.activity.count({
      where: {
        organizationId: orgId,
        createdAt: { gte: today },
        type: { in: ["MESSAGE_OUTBOUND", "CALL_LOGGED"] },
      },
    }),
    prisma.activity.count({
      where: {
        organizationId: orgId,
        createdAt: { gte: today },
        type: { in: ["MESSAGE_INBOUND", "MESSAGE_OUTBOUND"] },
      },
    }),
    prisma.call.count({ where: { organizationId: orgId, startedAt: { gte: today } } }),
    prisma.task.count({
      where: { organizationId: orgId, completedAt: null, dueAt: { lte: new Date() } },
    }),
    prisma.deal.count({ where: { organizationId: orgId, status: "WON", closedAt: { gte: today } } }),
    prisma.deal.aggregate({
      where: { organizationId: orgId, status: "WON" },
      _sum: { value: true },
    }),
    prisma.lead.count({ where: { organizationId: orgId, status: "OPEN" } }),
    prisma.task.findMany({
      where: { organizationId: orgId, completedAt: null, dueAt: { lt: new Date() } },
      include: { lead: { include: { contact: true } }, assignedTo: true },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
    prisma.lead.findMany({
      where: { organizationId: orgId, status: "OPEN", score: { gte: 70 } },
      include: { contact: true },
      orderBy: { score: "desc" },
      take: 5,
    }),
    prisma.activity.findMany({
      where: { organizationId: orgId },
      include: { lead: { include: { contact: true } }, actor: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, role: { in: ["AGENT", "MANAGER"] }, active: true },
      include: {
        ownedLeads: { select: { id: true, status: true } },
        calls: { select: { id: true } },
        _count: { select: { ownedLeads: true } },
      },
    }),
  ]);

  const leaderboard = await Promise.all(
    agents.map(async (agent) => {
      const deals = await prisma.deal.findMany({
        where: { lead: { ownerId: agent.id }, status: "WON" },
      });
      const revenue = deals.reduce((sum, d) => sum + Number(d.value), 0);
      return {
        id: agent.id,
        name: agent.name,
        leads: agent._count.ownedLeads,
        calls: agent.calls.length,
        deals: deals.length,
        revenue,
      };
    })
  );
  leaderboard.sort((a, b) => b.revenue - a.revenue);

  const stats = [
    { label: "New leads today", value: newLeadsToday },
    { label: "Contacted today", value: contactedToday },
    { label: "Conversations today", value: conversationsToday },
    { label: "Calls today", value: callsToday },
    { label: "Follow-ups due", value: followUpsDue },
    { label: "Deals won today", value: dealsWon },
    { label: "Open pipeline", value: totalOpenLeads },
    { label: "Total revenue", value: formatCurrency(Number(revenueAgg._sum.value ?? 0)) },
  ];

  return (
    <div className="pb-10">
      <PageHeader title="Dashboard" description={`Welcome back, ${session.name.split(" ")[0]}.`} />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Sales team leaderboard</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Leads</th>
                  <th className="pb-2 font-medium">Calls</th>
                  <th className="pb-2 font-medium">Deals</th>
                  <th className="pb-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-800">{a.name}</td>
                    <td className="py-2 text-slate-600">{a.leads}</td>
                    <td className="py-2 text-slate-600">{a.calls}</td>
                    <td className="py-2 text-slate-600">{a.deals}</td>
                    <td className="py-2 text-slate-600">{formatCurrency(a.revenue)}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No agents yet — add some in Settings → Users.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Alerts</h2>
            <ul className="space-y-2 text-sm">
              {overdueTasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2">
                  <span>🔴</span>
                  <Link href={`/leads/${t.leadId}`} className="text-slate-700 hover:underline">
                    Follow-up overdue — {t.lead.contact.firstName} {t.lead.contact.lastName}
                  </Link>
                </li>
              ))}
              {hotLeads.map((l) => (
                <li key={l.id} className="flex items-start gap-2">
                  <span>🔥</span>
                  <Link href={`/leads/${l.id}`} className="text-slate-700 hover:underline">
                    High-intent lead — {l.contact.firstName} {l.contact.lastName} ({l.score}/100)
                  </Link>
                </li>
              ))}
              {overdueTasks.length === 0 && hotLeads.length === 0 && (
                <li className="text-slate-400">No alerts right now.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent activity</h2>
          <ul className="space-y-3 text-sm">
            {recentActivities.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/leads/${a.leadId}`} className="font-medium text-slate-800 hover:underline">
                    {a.lead.contact.firstName} {a.lead.contact.lastName}
                  </Link>
                  <span className="text-slate-500"> — {a.summary}</span>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{relativeTime(a.createdAt)}</span>
              </li>
            ))}
            {recentActivities.length === 0 && (
              <li className="text-slate-400">No activity yet — import some leads to get started.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
