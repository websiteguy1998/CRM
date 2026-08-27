import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import AddUserForm from "./add-user-form";

export default async function UsersSettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const users = await prisma.user.findMany({
    where: { organizationId: session.orgId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader title="Users & roles" />
      <div className="space-y-6 p-6">
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
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.role}</td>
                  <td className="px-4 py-2.5">
                    <span className={`badge ${u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
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
