import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import PendingCallSync from "@/components/pending-call-sync";
import TimezoneOffsetInput from "@/components/timezone-offset-input";
import { formatDateTime, localDateBoundary } from "@/lib/format";
import { hasFullLeadVisibility, leadWhereForSession } from "@/lib/access";
import type { CallDirection, CallStatus, Prisma } from "@prisma/client";

const STATUS_COLOR: Record<string, string> = {
  ANSWERED: "bg-emerald-100 text-emerald-700",
  MISSED: "bg-rose-100 text-rose-700",
  NO_ANSWER: "bg-amber-100 text-amber-700",
  VOICEMAIL: "bg-slate-100 text-slate-600",
};

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    agentId?: string;
    direction?: string;
    status?: string;
    from?: string;
    to?: string;
    tzOffset?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) return null;
  const { q, agentId, direction, status, from, to, tzOffset } = await searchParams;
  const tzOffsetMinutes = Number(tzOffset) || 0;
  const fullVisibility = hasFullLeadVisibility(session.role);

  const [calls, agents] = await Promise.all([
    prisma.call.findMany({
      where: {
        organizationId: session.orgId,
        // Full-visibility roles also see calls that never matched a lead
        // (no owner to check); everyone else only sees calls on leads
        // they're allowed to see, which excludes leadless calls entirely.
        ...(fullVisibility ? {} : { lead: leadWhereForSession(session) }),
        ...(fullVisibility && agentId ? { agentId } : {}),
        ...(direction ? { direction: direction as CallDirection } : {}),
        ...(status ? { status: status as CallStatus } : {}),
        ...(fullVisibility && (from || to)
          ? {
              startedAt: {
                ...(from ? { gte: localDateBoundary(from, tzOffsetMinutes) } : {}),
                ...(to ? { lte: localDateBoundary(to, tzOffsetMinutes, true) } : {}),
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { fromNumber: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
                { toNumber: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
                {
                  lead: {
                    contact: {
                      OR: [
                        { firstName: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
                        { phone: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
                        { email: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: { lead: { include: { contact: true } }, agent: true },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    fullVisibility
      ? prisma.user.findMany({ where: { organizationId: session.orgId, active: true, calls: { some: {} } } })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PendingCallSync />
      <PageHeader
        title="Calls"
        description="Zoom Phone call log — click-to-call and recordings appear here once Zoom is connected in Settings."
      />
      <div className="p-6">
        <form className="mb-4 flex flex-wrap gap-2" method="GET">
          <TimezoneOffsetInput />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search lead, phone, email…"
            className="input max-w-xs"
          />
          <select name="direction" defaultValue={direction ?? ""} className="input max-w-[150px]">
            <option value="">All directions</option>
            <option value="OUTBOUND">Outbound</option>
            <option value="INBOUND">Inbound</option>
          </select>
          <select name="status" defaultValue={status ?? ""} className="input max-w-[150px]">
            <option value="">All statuses</option>
            <option value="ANSWERED">Answered</option>
            <option value="MISSED">Missed</option>
            <option value="NO_ANSWER">No answer</option>
            <option value="VOICEMAIL">Voicemail</option>
          </select>
          {fullVisibility && (
            <>
              <select name="agentId" defaultValue={agentId ?? ""} className="input max-w-[160px]">
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input type="date" name="from" defaultValue={from} className="input max-w-[150px]" />
              <input type="date" name="to" defaultValue={to} className="input max-w-[150px]" />
            </>
          )}
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Lead</th>
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Direction</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Recording</th>
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
                      {call.lead ? (
                        <Link href={`/leads/${call.leadId}`} className="font-medium text-slate-800 hover:underline">
                          {call.lead.contact.firstName} {call.lead.contact.lastName}
                        </Link>
                      ) : (
                        <span className="text-slate-400">
                          {(call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber) ?? "Unknown number"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{call.agent?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{call.direction}</td>
                    <td className="px-4 py-2.5">
                      <span className={`badge ${STATUS_COLOR[call.status]}`}>{call.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {call.status === "ANSWERED" ? `${minutes}:${seconds.toString().padStart(2, "0")}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {call.recordingUrl ? (
                        <audio controls preload="none" src={call.recordingUrl} className="h-8 w-40" />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{call.nextAction ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-400">{formatDateTime(call.startedAt)}</td>
                  </tr>
                );
              })}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
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
