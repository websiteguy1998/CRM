import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import TaskCheckbox from "@/components/task-checkbox";
import { formatDateTime } from "@/lib/format";
import { hasFullLeadVisibility } from "@/lib/access";

const TYPE_ICON: Record<string, string> = {
  CALL: "📞",
  EMAIL: "📧",
  WHATSAPP: "💬",
  SMS: "📱",
  MEETING: "🗓️",
  OTHER: "📌",
};

export default async function TasksPage() {
  const session = await getSession();
  if (!session) return null;
  const now = new Date();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: session.orgId,
      ...(hasFullLeadVisibility(session.role) ? {} : { assignedToId: session.sub }),
    },
    include: { lead: { include: { contact: true } }, assignedTo: true },
    orderBy: { dueAt: "asc" },
    take: 300,
  });

  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  const overdue = open.filter((t) => t.dueAt < now);
  const today = open.filter((t) => t.dueAt >= now && t.dueAt <= endOfToday);
  const upcoming = open.filter((t) => t.dueAt > endOfToday);

  const groups = [
    { label: "Overdue", tasks: overdue, tone: "text-rose-600" },
    { label: "Due today", tasks: today, tone: "text-amber-600" },
    { label: "Upcoming", tasks: upcoming, tone: "text-slate-600" },
  ];

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="No lead should go quiet — every follow-up created from a lead shows up here."
      />
      <div className="space-y-6 p-6">
        {groups.map((g) => (
          <div key={g.label} className="card p-5">
            <h2 className={`mb-3 text-sm font-semibold ${g.tone}`}>
              {g.label} ({g.tasks.length})
            </h2>
            <ul className="space-y-2">
              {g.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                  <TaskCheckbox taskId={t.id} completed={Boolean(t.completedAt)} />
                  <span>{TYPE_ICON[t.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-400">
                      <Link href={`/leads/${t.leadId}`} className="hover:underline">
                        {t.lead.contact.firstName} {t.lead.contact.lastName}
                      </Link>
                      {" · "}
                      {formatDateTime(t.dueAt)}
                      {t.assignedTo ? ` · ${t.assignedTo.name}` : ""}
                    </p>
                  </div>
                </li>
              ))}
              {g.tasks.length === 0 && <li className="text-sm text-slate-400">Nothing here.</li>}
            </ul>
          </div>
        ))}

        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">
            Completed ({done.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-2 py-1 text-sm text-slate-400 line-through">
                <TaskCheckbox taskId={t.id} completed={Boolean(t.completedAt)} />
                {t.title}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
