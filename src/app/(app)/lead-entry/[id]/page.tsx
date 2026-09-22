import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import { relativeTime } from "@/lib/format";
import { isAdmin } from "@/lib/access";
import { getMonthlyLeadEntry } from "@/lib/performance";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function LeadEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;
  if (!isAdmin(session.role)) return null;
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, organizationId: session.orgId, role: "LEAD_ENTRY" },
  });
  if (!user) notFound();

  const [leads, monthly] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId: session.orgId, createdById: user.id },
      include: { contact: true, owner: true },
      orderBy: { createdAt: "desc" },
    }),
    getMonthlyLeadEntry(user.id),
  ]);

  const today = startOfToday();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = startOfMonth();

  const todayCount = leads.filter((l) => l.createdAt >= today).length;
  const weekCount = leads.filter((l) => l.createdAt >= weekAgo).length;
  const monthCount = leads.filter((l) => l.createdAt >= monthStart).length;
  const unassigned = leads.filter((l) => !l.ownerId).length;
  const assigned = leads.length - unassigned;

  const stats = [
    { label: "Today", value: todayCount },
    { label: "This week", value: weekCount },
    { label: "This month", value: monthCount },
    { label: "Total added", value: leads.length },
    { label: "Assigned so far", value: assigned },
    { label: "Still unassigned", value: unassigned },
  ];

  return (
    <div className="pb-10">
      <PageHeader
        title={user.name}
        description={`${user.email} · Lead Entry${user.active ? "" : " · Inactive"}`}
        actions={
          <Link href="/lead-entry" className="btn-secondary">
            ← All lead entry agents
          </Link>
        }
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
            <table className="w-full min-w-[300px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-4 font-medium">Month</th>
                  <th className="py-1.5 font-medium">Leads added</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 pr-4 font-medium text-slate-800">{m.label}</td>
                    <td className="py-1.5 text-slate-600">{m.leadsAdded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Leads added ({leads.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] table-fixed text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
                  <th className="w-48 py-1.5 font-medium">Client</th>
                  <th className="w-36 py-1.5 font-medium">Seller</th>
                  <th className="w-28 py-1.5 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 50).map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="truncate py-1.5">
                      <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline">
                        {lead.contact.firstName}
                      </Link>
                    </td>
                    <td className="truncate py-1.5 text-slate-600">{lead.owner?.name ?? "Unassigned"}</td>
                    <td className="truncate py-1.5 text-slate-400">{relativeTime(lead.createdAt)}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400">
                      No leads added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
