import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import PendingCallSync from "@/components/pending-call-sync";
import TimezoneOffsetInput from "@/components/timezone-offset-input";
import CallsTable from "@/components/calls-table";
import { localDateBoundary } from "@/lib/format";
import { hasFullLeadVisibility, isAdmin, leadWhereForSession } from "@/lib/access";
import type { CallDirection, CallStatus, Prisma } from "@prisma/client";

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
  const admin = isAdmin(session.role);

  const [calls, agents] = await Promise.all([
    prisma.call.findMany({
      where: {
        organizationId: session.orgId,
        AND: [
          // Full-visibility roles see everything, including calls that
          // never matched a lead. Everyone else sees calls on leads
          // they're allowed to see, PLUS any call they personally
          // placed/received themselves (agentId) even if that lead isn't
          // (yet) assigned to them or there's no lead at all — otherwise
          // an agent's own calls could be invisible to them. This has to
          // be its own AND entry (not merged as a sibling key) because
          // the search filter below also needs an OR of its own.
          fullVisibility ? {} : { OR: [{ lead: leadWhereForSession(session) }, { agentId: session.sub }] },
          fullVisibility && agentId ? { agentId } : {},
          direction ? { direction: direction as CallDirection } : {},
          status ? { status: status as CallStatus } : {},
          fullVisibility && (from || to)
            ? {
                startedAt: {
                  ...(from ? { gte: localDateBoundary(from, tzOffsetMinutes) } : {}),
                  ...(to ? { lte: localDateBoundary(to, tzOffsetMinutes, true) } : {}),
                },
              }
            : {},
          q
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
            : {},
        ],
      },
      include: { lead: { include: { contact: true } }, agent: true },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    fullVisibility
      ? prisma.user.findMany({ where: { organizationId: session.homeOrgId, active: true, calls: { some: { organizationId: session.orgId } } } })
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

        <CallsTable
          admin={admin}
          calls={calls.map((call) => ({
            id: call.id,
            leadId: call.leadId,
            leadName: call.lead ? `${call.lead.contact.firstName} ${call.lead.contact.lastName ?? ""}`.trim() : null,
            agentName: call.agent?.name ?? null,
            direction: call.direction,
            status: call.status,
            durationSec: call.durationSec,
            recordingUrl: call.recordingUrl,
            fromNumber: call.fromNumber,
            toNumber: call.toNumber,
            nextAction: call.nextAction,
            startedAt: call.startedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
