import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import AddUserForm from "./add-user-form";
import ApprovalActions from "./approval-actions";
import { relativeTime } from "@/lib/format";

export default async function UsersSettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const users = await prisma.user.findMany({
    where: { organizationId: session.orgId },
    orderBy: { createdAt: "asc" },
  });
  const pending = users.filter((u) => !u.active);
  const active = users.filter((u) => u.active);

  return (
    <div>
      <PageHeader title="Users & roles" />
      <div className="space-y-6 p-6">
        {session.role === "ADMIN" && pending.length > 0 && (
          <div className="card border-amber-200 p-5">
            <h2 className="mb-3 text-sm font-semibold text-amber-700">
              Pending approval ({pending.length})
            </h2>
            <ul className="space-y-3">
              {pending.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {u.name} <span className="font-normal text-slate-500">— {u.email}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      Requested {u.role} · {relativeTime(u.createdAt)}
                    </p>
                  </div>
                  <ApprovalActions userId={u.id} requestedRole={u.role} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {session.role === "ADMIN" && (
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Add user</h2>
            <AddUserForm />
          </div>
        )}
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {active.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.role}</td>
                  <td className="px-4 py-2.5">
                    <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
