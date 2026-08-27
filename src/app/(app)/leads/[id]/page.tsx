import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import StageBadge from "@/components/stage-badge";
import ScoreBadge from "@/components/score-badge";
import StageSelector from "@/components/stage-selector";
import OwnerSelector from "@/components/owner-selector";
import LeadActions from "@/components/lead-actions";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { ActivityType } from "@prisma/client";

const ACTIVITY_ICON: Record<ActivityType, string> = {
  LEAD_CREATED: "✨",
  LEAD_ASSIGNED: "👤",
  STAGE_CHANGED: "🧭",
  MESSAGE_INBOUND: "📥",
  MESSAGE_OUTBOUND: "📤",
  CALL_LOGGED: "📞",
  TASK_CREATED: "📅",
  TASK_COMPLETED: "✅",
  NOTE_ADDED: "📝",
  DEAL_UPDATED: "💰",
  SCORE_UPDATED: "📈",
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;
  const { id } = await params;

  const [lead, owners] = await Promise.all([
    prisma.lead.findFirst({
      where: { id, organizationId: session.orgId },
      include: {
        contact: true,
        company: true,
        stage: true,
        pipeline: { include: { stages: { orderBy: { order: "asc" } } } },
        owner: true,
        source: true,
        campaign: true,
        deals: true,
        tasks: { orderBy: { dueAt: "asc" } },
        activities: { include: { actor: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.user.findMany({ where: { organizationId: session.orgId, active: true } }),
  ]);

  if (!lead) notFound();

  const openTasks = lead.tasks.filter((t) => !t.completedAt);

  return (
    <div className="pb-10">
      <PageHeader
        title={`${lead.contact.firstName} ${lead.contact.lastName ?? ""}`.trim()}
        description={lead.company?.name ?? undefined}
      />
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <StageBadge name={lead.stage.name} isWon={lead.stage.isWon} isLost={lead.stage.isLost} />
              <ScoreBadge score={lead.score} />
              <span className="text-sm text-slate-500">
                {lead.contact.phone && <span className="mr-3">📞 {lead.contact.phone}</span>}
                {lead.contact.email && <span>📧 {lead.contact.email}</span>}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="label mb-1">Stage</p>
                <StageSelector leadId={lead.id} stages={lead.pipeline.stages} currentStageId={lead.stageId} />
              </div>
              <div>
                <p className="label mb-1">Owner</p>
                <OwnerSelector
                  leadId={lead.id}
                  owners={owners.map((o) => ({ id: o.id, name: o.name }))}
                  currentOwnerId={lead.ownerId}
                />
              </div>
              <div>
                <p className="label mb-1">Source / campaign</p>
                <p className="input flex items-center bg-slate-50 text-slate-500">
                  {lead.source?.name ?? "—"}
                  {lead.campaign ? ` / ${lead.campaign.name}` : ""}
                </p>
              </div>
            </div>
            {Array.isArray(lead.scoreReasons) && lead.scoreReasons.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Score factors: {(lead.scoreReasons as string[]).join(" · ")}
              </p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Activity timeline</h2>
            <ol className="space-y-4">
              {lead.activities.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm">
                    {ACTIVITY_ICON[a.type]}
                  </div>
                  <div className="min-w-0 flex-1 border-b border-slate-50 pb-4">
                    <p className="text-sm text-slate-800">{a.summary}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(a.createdAt)}
                      {a.actor ? ` · ${a.actor.name}` : ""}
                    </p>
                  </div>
                </li>
              ))}
              {lead.activities.length === 0 && (
                <li className="text-sm text-slate-400">No activity yet.</li>
              )}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <LeadActions
            leadId={lead.id}
            hasPhone={Boolean(lead.contact.phone)}
            hasEmail={Boolean(lead.contact.email)}
          />

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Open follow-ups</h2>
            <ul className="space-y-2 text-sm">
              {openTasks.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(t.dueAt)}</p>
                  </div>
                  {t.dueAt < new Date() && <span className="badge bg-rose-100 text-rose-700">Overdue</span>}
                </li>
              ))}
              {openTasks.length === 0 && <li className="text-slate-400">Nothing scheduled.</li>}
            </ul>
          </div>

          {lead.deals.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Deals</h2>
              <ul className="space-y-2 text-sm">
                {lead.deals.map((d) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span className="text-slate-800">{d.title}</span>
                    <span className="badge bg-slate-100 text-slate-600">{d.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="px-1 text-xs text-slate-400">
            Created {relativeTime(lead.createdAt)} · Last activity {relativeTime(lead.lastActivityAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
