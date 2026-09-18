import type { ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import StageBadge from "@/components/stage-badge";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/format";
import type { MonthlyPerformance } from "@/lib/performance";

type Seller = { name: string; email: string; role: string; active: boolean };
type Lead = {
  id: string;
  status: "OPEN" | "WON" | "LOST" | "NURTURE";
  contact: { firstName: string };
  stage: { name: string; isWon: boolean; isLost: boolean };
  price: unknown;
  lastActivityAt: Date;
};
type Call = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  durationSec: number;
  startedAt: Date;
};

/**
 * Shared between the Super Admin's /sellers/[id] view and a seller's own
 * /performance page — same stats, same monthly record, so an admin and
 * the agent themselves are always looking at identical numbers.
 */
export default function SellerProfile({
  seller,
  leads,
  calls,
  todayLeadCount,
  monthly,
  actions,
}: {
  seller: Seller;
  leads: Lead[];
  calls: Call[];
  todayLeadCount: number;
  monthly: MonthlyPerformance[];
  actions?: ReactNode;
}) {
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
        actions={actions}
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

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Monthly performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-4 font-medium">Month</th>
                  <th className="py-1.5 pr-4 font-medium">Leads assigned</th>
                  <th className="py-1.5 pr-4 font-medium">Won</th>
                  <th className="py-1.5 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 pr-4 font-medium text-slate-800">{m.label}</td>
                    <td className="py-1.5 pr-4 text-slate-600">{m.leadsAssigned}</td>
                    <td className="py-1.5 pr-4 text-emerald-700">{m.won}</td>
                    <td className="py-1.5 text-slate-600">{formatCurrency(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
