import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import PipelineBoard from "./pipeline-board";
import { leadWhereForSession } from "@/lib/access";

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) return null;

  const pipeline = await prisma.pipeline.findFirst({
    where: { organizationId: session.orgId, isDefault: true },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          leads: {
            where: { organizationId: session.orgId, ...leadWhereForSession(session) },
            include: { contact: true, company: true, owner: true, deals: true },
            orderBy: { lastActivityAt: "desc" },
          },
        },
      },
    },
  });

  const stages =
    pipeline?.stages.map((s) => ({
      id: s.id,
      name: s.name,
      isWon: s.isWon,
      isLost: s.isLost,
      leads: s.leads.map((l) => ({
        id: l.id,
        name: `${l.contact.firstName} ${l.contact.lastName ?? ""}`.trim(),
        company: l.company?.name ?? null,
        score: l.score,
        ownerName: l.owner?.name ?? null,
        dealValue: l.deals[0] ? Number(l.deals[0].value) : null,
      })),
    })) ?? [];

  return (
    <div>
      <PageHeader title="Pipeline" description="Drag a card to move a lead through the funnel." />
      <div className="p-6">
        <PipelineBoard initialStages={stages} />
      </div>
    </div>
  );
}
