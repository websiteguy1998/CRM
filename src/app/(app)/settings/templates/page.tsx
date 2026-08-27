import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import AddTemplateForm from "./add-template-form";
import { channelIcon } from "@/lib/format";

export default async function TemplatesSettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const templates = await prisma.template.findMany({
    where: { organizationId: session.orgId },
    orderBy: { channel: "asc" },
  });

  return (
    <div>
      <PageHeader title="Templates" description="Quick replies agents can reuse across channels." />
      <div className="space-y-6 p-6">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">New template</h2>
          <AddTemplateForm />
        </div>
        <div className="card divide-y divide-slate-100">
          {templates.map((t) => (
            <div key={t.id} className="p-4">
              <p className="text-sm font-medium text-slate-800">
                {channelIcon(t.channel)} {t.name}
              </p>
              <p className="mt-1 text-sm text-slate-500">{t.body}</p>
            </div>
          ))}
          {templates.length === 0 && <p className="p-4 text-center text-sm text-slate-400">No templates yet.</p>}
        </div>
      </div>
    </div>
  );
}
