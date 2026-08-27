import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import StageBadge from "@/components/stage-badge";
import ScoreBadge from "@/components/score-badge";
import NewLeadDialog from "@/components/new-lead-dialog";
import { relativeTime } from "@/lib/format";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stageId?: string; ownerId?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  const { q, stageId, ownerId } = await searchParams;

  const [leads, stages, owners] = await Promise.all([
    prisma.lead.findMany({
      where: {
        organizationId: session.orgId,
        ...(stageId ? { stageId } : {}),
        ...(ownerId ? { ownerId } : {}),
        ...(q
          ? {
              contact: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: { contact: true, company: true, stage: true, owner: true, source: true },
      orderBy: { lastActivityAt: "desc" },
      take: 200,
    }),
    prisma.pipelineStage.findMany({
      where: { pipeline: { organizationId: session.orgId, isDefault: true } },
      orderBy: { order: "asc" },
    }),
    prisma.user.findMany({ where: { organizationId: session.orgId, active: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description={`${leads.length} leads`}
        actions={
          <>
            <Link href="/leads/import" className="btn-secondary">
              Import CSV
            </Link>
            <NewLeadDialog />
          </>
        }
      />
      <div className="p-6">
        <form className="mb-4 flex flex-wrap gap-2" method="GET">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, phone…"
            className="input max-w-xs"
          />
          <select name="stageId" defaultValue={stageId ?? ""} className="input max-w-[180px]">
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select name="ownerId" defaultValue={ownerId ?? ""} className="input max-w-[180px]">
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline">
                      {lead.contact.firstName} {lead.contact.lastName}
                    </Link>
                    <div className="text-xs text-slate-400">{lead.contact.phone || lead.contact.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.company?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.source?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <StageBadge name={lead.stage.name} isWon={lead.stage.isWon} isLost={lead.stage.isLost} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ScoreBadge score={lead.score} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.owner?.name ?? "Unassigned"}</td>
                  <td className="px-4 py-2.5 text-slate-400">{relativeTime(lead.lastActivityAt)}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
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
