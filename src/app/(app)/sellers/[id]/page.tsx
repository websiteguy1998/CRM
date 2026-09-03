import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import StageBadge from "@/components/stage-badge";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/format";
import { isAdmin } from "@/lib/access";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function SellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;
  if (!isAdmin(session.role)) return null;
  const { id } = await params;

  const seller = await prisma.user.findFirst({
    where: { id, organizationId: session.orgId, role: { in: ["AGENT", "MANAGER"] } },
  });
  if (!seller) notFound();

  const [leads, calls, assignedToday] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId: session.orgId, ownerId: seller.id },
      include: { contact: true, stage: true },
      orderBy: { lastActivityAt: "desc" },
    }),
    prisma.call.findMany({
      where: { organizationId: session.orgId, agentId: seller.id },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.activity.findMany({
      where: {
        organizationId: session.orgId,
        type: "LEAD_ASSIGNED",
        createdAt: { gte: startOfToday() },
        lead: { ownerId: seller.id },
      },
      select: { leadId: true },
    }),
  ]);

  const todayLeadCount = new Set(assignedToday.map((a) => a.leadId)).size;
  const open = leads.filter((l) => l.status === "OPEN").length;
  const won = leads.filter((l) => l.status === "WON");
  const lost = leads.filter((l) => l.status === "LOST").length;
  const nurture = leads.filter((l) => l.status === "NURTURE").length;
  const wonValue = won.reduce((sum, l) => sum + (l.price != null ? Number(l.price) : 0), 0);

  const answeredCalls = calls.filter((c) => c.status === "ANSWERED").length;
  const missedCalls = calls.filter((c) => c.status === "MISSED" || c.status === "NO_ANSWER").length;
  const totalDurationSec = calls.reduce((sum, c) => sum + c.durationSec, 0);

  const stats = [
    { label: "Today's leads", value: todayLeadCount },
    { label: "Total leads", value: leads.length },
    { label: "Open", value: open },
    { label: "Won", value: won.length },
    { label: "Lost", value: lost },
    { label: "Nurture", value: nurture },
    { label: "Won value", value: formatCurrency(wonValue) },
    { label: "Total calls", value: calls.length },
  ];

  return (
    <div className="pb-10">
      <PageHeader
        title={seller.name}
        description={`${seller.email} · ${seller.role}${seller.active ? "" : " · Inactive"}`}
        actions={
          <Link href="/sellers" className="btn-secondary">
            ← All sellers
          </Link>
        }
      />
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
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Leads assigned ({leads.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] table-fixed text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
                    <th className="w-48 py-1.5 font-medium">Client</th>
                    <th className="w-28 py-1.5 font-medium">Stage</th>
                    <th className="w-24 py-1.5 font-medium">Price</th>
                    <th className="w-28 py-1.5 font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="truncate py-1.5">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline">
                          {lead.contact.firstName}
                        </Link>
                      </td>
                      <td className="py-1.5">
                        <StageBadge name={lead.stage.name} isWon={lead.stage.isWon} isLost={lead.stage.isLost} />
                      </td>
                      <td className="truncate py-1.5 text-slate-600">
                        {lead.price != null ? formatCurrency(Number(lead.price)) : "—"}
                      </td>
                      <td className="truncate py-1.5 text-slate-400">{relativeTime(lead.lastActivityAt)}</td>
                    </tr>
                  ))}
                  {leads.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        No leads assigned yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Calls</h2>
            <p className="mb-3 text-xs text-slate-500">
              {answeredCalls} answered · {missedCalls} missed · {Math.floor(totalDurationSec / 60)} min total
            </p>
            <ul className="space-y-3 text-sm">
              {calls.slice(0, 20).map((c) => (
                <li key={c.id} className="border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-800">
                      {c.direction === "OUTBOUND" ? "Outbound" : "Inbound"} · {c.status.toLowerCase()}
                      {c.durationSec > 0
                        ? ` (${Math.floor(c.durationSec / 60)}:${(c.durationSec % 60).toString().padStart(2, "0")})`
                        : ""}
                    </span>
                    <span className="text-xs text-slate-400">{formatDateTime(c.startedAt)}</span>
                  </div>
                </li>
              ))}
              {calls.length === 0 && <li className="text-slate-400">No calls logged yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
