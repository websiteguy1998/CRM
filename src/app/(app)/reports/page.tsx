import { Link } from "@/components/crm-context";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import MonthlyRevenuePanel from "@/components/monthly-revenue-panel";
import { formatCurrency } from "@/lib/format";
import { getMonthlyRevenue } from "@/lib/performance";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) return null;
  const orgId = session.orgId;

  const [leadsBySource, leadsByStage, agents, dealsWon, dealsLost, messages, calls] = await Promise.all([
    prisma.lead.groupBy({
      by: ["sourceId"],
      where: { organizationId: orgId },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["stageId"],
      where: { organizationId: orgId },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { organizationId: session.homeOrgId, role: { in: ["AGENT", "MANAGER"] } },
      include: {
        ownedLeads: { where: { organizationId: orgId }, select: { id: true, status: true } },
        calls: { where: { organizationId: orgId }, select: { id: true, status: true } },
      },
    }),
    // Revenue tracks Lead.price (what a seller enters as the closed
    // amount), not the separate Deal model — nothing in the app ever
    // creates a Deal record, so Deal-based totals were always zero.
    prisma.lead.findMany({ where: { organizationId: orgId, status: "WON" }, select: { price: true } }),
    prisma.lead.count({ where: { organizationId: orgId, status: "LOST" } }),
    prisma.message.groupBy({
      by: ["direction"],
      where: { conversation: { organizationId: orgId } },
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { _all: true },
    }),
  ]);

  const sourceNames = await prisma.leadSource.findMany({ where: { organizationId: orgId } });
  const stageNames = await prisma.pipelineStage.findMany({ where: { pipeline: { organizationId: orgId } } });

  const totalRevenue = dealsWon.reduce((sum, l) => sum + (l.price != null ? Number(l.price) : 0), 0);
  const totalLeads = await prisma.lead.count({ where: { organizationId: orgId } });
  const conversionRate = totalLeads ? ((dealsWon.length / totalLeads) * 100).toFixed(1) : "0.0";

  const totalCalls = calls.reduce((s, c) => s + c._count._all, 0);
  const answeredCalls = calls.find((c) => c.status === "ANSWERED")?._count._all ?? 0;
  const callAnswerRate = totalCalls ? ((answeredCalls / totalCalls) * 100).toFixed(0) : "0";

  // One groupBy for every agent's won deals instead of a query per agent in
  // a loop — scales with one extra round-trip total, not one per agent.
  const wonByOwner = agents.length
    ? await prisma.lead.groupBy({
        by: ["ownerId"],
        where: { organizationId: orgId, status: "WON", ownerId: { in: agents.map((a) => a.id) } },
        _sum: { price: true },
        _count: { _all: true },
      })
    : [];
  const wonByOwnerMap = new Map(wonByOwner.map((w) => [w.ownerId, w]));

  const agentRows = agents.map((a) => {
    const won = wonByOwnerMap.get(a.id);
    const deals = won?._count._all ?? 0;
    const revenue = won?._sum.price != null ? Number(won._sum.price) : 0;
    const rate = a.ownedLeads.length ? ((deals / a.ownedLeads.length) * 100).toFixed(1) : "0.0";
    return { name: a.name, leads: a.ownedLeads.length, calls: a.calls.length, deals, revenue, rate };
  });

  const monthlyRevenue = (await getMonthlyRevenue(orgId)).map((m) => ({
    ...m,
    projects: m.projects.map((p) => ({ ...p, wonAt: p.wonAt.toISOString() })),
  }));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Sales, agent, source and channel performance."
        actions={
          <Link href="/reports/performance" className="btn-secondary">
            Lead type × Seller performance
          </Link>
        }
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total revenue", value: formatCurrency(totalRevenue) },
            { label: "Deals won", value: dealsWon.length },
            { label: "Deals lost", value: dealsLost },
            { label: "Conversion rate", value: `${conversionRate}%` },
          ].map((s) => (
            <div key={s.label} className="card p-4">
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>

        <MonthlyRevenuePanel months={monthlyRevenue} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Agents</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Leads</th>
                  <th className="pb-2 font-medium">Calls</th>
                  <th className="pb-2 font-medium">Deals</th>
                  <th className="pb-2 font-medium">Conv.</th>
                  <th className="pb-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((a) => (
                  <tr key={a.name} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-800">{a.name}</td>
                    <td className="py-2 text-slate-600">{a.leads}</td>
                    <td className="py-2 text-slate-600">{a.calls}</td>
                    <td className="py-2 text-slate-600">{a.deals}</td>
                    <td className="py-2 text-slate-600">{a.rate}%</td>
                    <td className="py-2 text-slate-600">{formatCurrency(a.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Leads by source</h2>
            <ul className="space-y-2 text-sm">
              {leadsBySource.map((row) => (
                <li key={row.sourceId ?? "none"} className="flex items-center justify-between">
                  <span className="text-slate-700">
                    {sourceNames.find((s) => s.id === row.sourceId)?.name ?? "Unknown"}
                  </span>
                  <span className="font-medium text-slate-900">{row._count._all}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Pipeline distribution</h2>
            <ul className="space-y-2 text-sm">
              {leadsByStage.map((row) => (
                <li key={row.stageId} className="flex items-center justify-between">
                  <span className="text-slate-700">{stageNames.find((s) => s.id === row.stageId)?.name}</span>
                  <span className="font-medium text-slate-900">{row._count._all}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Communication</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-slate-700">Messages sent</span>
                <span className="font-medium text-slate-900">
                  {messages.find((m) => m.direction === "OUTBOUND")?._count._all ?? 0}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-700">Messages received</span>
                <span className="font-medium text-slate-900">
                  {messages.find((m) => m.direction === "INBOUND")?._count._all ?? 0}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-700">Call answer rate</span>
                <span className="font-medium text-slate-900">{callAnswerRate}%</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
