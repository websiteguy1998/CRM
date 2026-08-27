import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import { formatDateTime } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  ANSWERED: "bg-emerald-100 text-emerald-700",
  MISSED: "bg-rose-100 text-rose-700",
  NO_ANSWER: "bg-amber-100 text-amber-700",
  VOICEMAIL: "bg-slate-100 text-slate-600",
};

export default async function CallsPage() {
  const session = await getSession();
  if (!session) return null;

  const calls = await prisma.call.findMany({
    where: { organizationId: session.orgId },
    include: { lead: { include: { contact: true } }, agent: true },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Calls"
        description="Zoom Phone call log — click-to-call and recordings appear here once Zoom is connected in Settings."
      />
      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Lead</th>
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Direction</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Next action</th>
                <th className="px-4 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => {
                const minutes = Math.floor(call.durationSec / 60);
                const seconds = call.durationSec % 60;
                return (
                  <tr key={call.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/leads/${call.leadId}`} className="font-medium text-slate-800 hover:underline">
                        {call.lead.contact.firstName} {call.lead.contact.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{call.agent?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{call.direction}</td>
                    <td className="px-4 py-2.5">
                      <span className={`badge ${STATUS_COLOR[call.status]}`}>{call.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {call.status === "ANSWERED" ? `${minutes}:${seconds.toString().padStart(2, "0")}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{call.nextAction ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-400">{formatDateTime(call.startedAt)}</td>
                  </tr>
                );
              })}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No calls logged yet. Log one from a lead&apos;s profile.
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
