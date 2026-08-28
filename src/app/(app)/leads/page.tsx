import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import StageBadge from "@/components/stage-badge";
import ScoreBadge from "@/components/score-badge";
import NewLeadDialog from "@/components/new-lead-dialog";
import OwnerSelector from "@/components/owner-selector";
import TimezoneOffsetInput from "@/components/timezone-offset-input";
import { formatCurrency, formatDateTime, localDateBoundary, relativeTime } from "@/lib/format";
import { isAdmin, leadWhereForSession } from "@/lib/access";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stageId?: string;
    ownerId?: string;
    createdById?: string;
    from?: string;
    to?: string;
    tzOffset?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) return null;
  const { q, stageId, ownerId, createdById, from, to, tzOffset } = await searchParams;
  const tzOffsetMinutes = Number(tzOffset) || 0;
  const admin = isAdmin(session.role);
  const entryOnly = session.role === "LEAD_ENTRY";

  const [leads, stages, owners, enterers] = await Promise.all([
    prisma.lead.findMany({
      where: {
        organizationId: session.orgId,
        ...leadWhereForSession(session),
        ...(stageId ? { stageId } : {}),
        ...(admin && ownerId ? { ownerId } : {}),
        ...(admin && createdById ? { createdById } : {}),
        ...(admin && (from || to)
          ? {
              createdAt: {
                ...(from ? { gte: localDateBoundary(from, tzOffsetMinutes) } : {}),
                ...(to ? { lte: localDateBoundary(to, tzOffsetMinutes, true) } : {}),
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { idName: { contains: q, mode: "insensitive" } },
                { websiteUrl: { contains: q, mode: "insensitive" } },
                {
                  contact: {
                    OR: [
                      { firstName: { contains: q, mode: "insensitive" } },
                      { email: { contains: q, mode: "insensitive" } },
                      { phone: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      include: { contact: true, stage: true, owner: true, createdBy: true },
      orderBy: { lastActivityAt: "desc" },
      take: 200,
    }),
    prisma.pipelineStage.findMany({
      where: { pipeline: { organizationId: session.orgId, isDefault: true } },
      orderBy: { order: "asc" },
    }),
    prisma.user.findMany({ where: { organizationId: session.orgId, active: true } }),
    admin
      ? prisma.user.findMany({
          where: { organizationId: session.orgId, active: true, role: { in: ["ADMIN", "LEAD_ENTRY"] } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description={
          entryOnly ? `${leads.length} leads you entered in the last 24 hours` : `${leads.length} leads`
        }
        actions={
          <>
            {(admin || entryOnly) && (
              <Link href="/leads/import" className="btn-secondary">
                Import CSV
              </Link>
            )}
            {(admin || entryOnly) && <NewLeadDialog />}
          </>
        }
      />
      <div className="p-6">
        <form className="mb-4 flex flex-wrap gap-2" method="GET">
          <TimezoneOffsetInput />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search client, ID name, website…"
            className="input max-w-xs"
          />
          <select name="stageId" defaultValue={stageId ?? ""} className="input max-w-[160px]">
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {admin && (
            <>
              <select name="ownerId" defaultValue={ownerId ?? ""} className="input max-w-[160px]">
                <option value="">All sellers</option>
                {owners
                  .filter((o) => o.role === "AGENT" || o.role === "MANAGER")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
              <select name="createdById" defaultValue={createdById ?? ""} className="input max-w-[160px]">
                <option value="">Entered by anyone</option>
                {enterers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
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
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">ID name / URL</th>
                <th className="px-4 py-2 font-medium">Country</th>
                <th className="px-4 py-2 font-medium">Website</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Delivery</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                {admin && <th className="px-4 py-2 font-medium">Entered by</th>}
                <th className="px-4 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    {entryOnly ? (
                      <span className="font-medium text-slate-800">{lead.contact.firstName}</span>
                    ) : (
                      <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline">
                        {lead.contact.firstName}
                      </Link>
                    )}
                    <div className="text-xs text-slate-400">{lead.contact.phone || lead.contact.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {lead.idName ?? "—"}
                    {lead.idUrl && (
                      <a
                        href={lead.idUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 text-indigo-600 hover:underline"
                      >
                        ↗
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.country ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {lead.websiteUrl ? (
                      <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                        {lead.websiteUrl.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StageBadge name={lead.stage.name} isWon={lead.stage.isWon} isLost={lead.stage.isLost} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {lead.price != null ? formatCurrency(Number(lead.price)) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {lead.deliveryDate ? formatDateTime(lead.deliveryDate) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.statusNote ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {admin ? (
                      <OwnerSelector
                        leadId={lead.id}
                        owners={owners
                          .filter((o) => o.role === "AGENT" || o.role === "MANAGER")
                          .map((o) => ({ id: o.id, name: o.name }))}
                        currentOwnerId={lead.ownerId}
                      />
                    ) : (
                      <span className="text-slate-600">{lead.owner?.name ?? "Unassigned"}</span>
                    )}
                  </td>
                  {admin && (
                    <td className="px-4 py-2.5 text-slate-600">{lead.createdBy?.name ?? "—"}</td>
                  )}
                  <td className="px-4 py-2.5 text-slate-400">{relativeTime(lead.lastActivityAt)}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={admin ? 11 : 10} className="px-4 py-10 text-center text-slate-400">
                    No leads yet. Add one or import a CSV to get started.
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
