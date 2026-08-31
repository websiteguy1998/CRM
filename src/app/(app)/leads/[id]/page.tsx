import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import StageBadge from "@/components/stage-badge";
import ScoreBadge from "@/components/score-badge";
import StageSelector from "@/components/stage-selector";
import OwnerSelector from "@/components/owner-selector";
import LeadActions from "@/components/lead-actions";
import LeadDetailsEditor from "@/components/lead-details-editor";
import PendingCallSync from "@/components/pending-call-sync";
import { formatDateTime, relativeTime } from "@/lib/format";
import { isAdmin, leadWhereForSession } from "@/lib/access";
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
  const admin = isAdmin(session.role);
  const entryOnly = session.role === "LEAD_ENTRY";

  const [lead, owners, currentUser] = await Promise.all([
    prisma.lead.findFirst({
      where: { id, organizationId: session.orgId, ...leadWhereForSession(session) },
      include: {
        contact: true,
        company: true,
        stage: true,
        pipeline: { include: { stages: { orderBy: { order: "asc" } } } },
        owner: true,
        source: true,
        campaign: true,
        deals: true,
        calls: { orderBy: { startedAt: "desc" } },
        notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { dueAt: "asc" } },
        activities: { include: { actor: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.user.findMany({ where: { organizationId: session.orgId, active: true } }),
    prisma.user.findUnique({ where: { id: session.sub }, select: { zoomUserEmail: true } }),
  ]);

  if (!lead) notFound();

  const openTasks = lead.tasks.filter((t) => !t.completedAt);

  return (
    <div className="pb-10">
      <PendingCallSync />
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
                {entryOnly ? (
                  <p className="input flex items-center bg-slate-50 text-slate-500">{lead.stage.name}</p>
                ) : (
                  <StageSelector leadId={lead.id} stages={lead.pipeline.stages} currentStageId={lead.stageId} />
                )}
              </div>
              <div>
                <p className="label mb-1">Seller</p>
                {admin ? (
                  <OwnerSelector
                    leadId={lead.id}
                    owners={owners.map((o) => ({ id: o.id, name: o.name }))}
                    currentOwnerId={lead.ownerId}
                  />
                ) : (
                  <p className="input flex items-center bg-slate-50 text-slate-500">
                    {lead.owner?.name ?? "Unassigned"}
                  </p>
                )}
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
          {!entryOnly && (
            <LeadActions
              leadId={lead.id}
              hasPhone={Boolean(lead.contact.phone)}
              hasEmail={Boolean(lead.contact.email)}
              zoomUserEmail={currentUser?.zoomUserEmail ?? null}
            />
          )}

          <LeadDetailsEditor
            leadId={lead.id}
            editable={admin || entryOnly}
            details={{
              clientName: lead.contact.firstName,
              phone: lead.contact.phone,
              email: lead.contact.email,
              idName: lead.idName,
              idUrl: lead.idUrl,
              country: lead.country,
              clientCountry: lead.clientCountry,
              websiteUrl: lead.websiteUrl,
              deliveryDate: lead.deliveryDate ? lead.deliveryDate.toISOString() : null,
              price: lead.price != null ? String(lead.price) : null,
              duration: lead.duration,
              statusNote: lead.statusNote,
              category: lead.category,
            }}
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

          {lead.calls.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Calls</h2>
              <ul className="space-y-3 text-sm">
                {lead.calls.map((c) => (
                  <li key={c.id} className="border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-800">
                        {c.direction === "OUTBOUND" ? "Outbound" : "Inbound"} · {c.status.toLowerCase()}
                        {c.durationSec > 0
                          ? ` (${Math.floor(c.durationSec / 60)}:${(c.durationSec % 60).toString().padStart(2, "0")})`
                          : ""}
                      </span>
                      <span className="text-xs text-slate-400">{relativeTime(c.startedAt)}</span>
                    </div>
                    {c.recordingUrl && (
                      <audio controls preload="none" src={c.recordingUrl} className="mt-2 h-8 w-full" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lead.notes.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Notes</h2>
              <ul className="space-y-3 text-sm">
                {lead.notes.map((n) => (
                  <li key={n.id} className="border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {n.author?.name ?? "Unknown"} · {relativeTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
