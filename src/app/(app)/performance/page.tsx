import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SellerProfile from "@/components/seller-profile";
import { getMonthlyPerformance } from "@/lib/performance";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A seller's own view of the same monthly record a Super Admin sees on their /sellers/[id] profile. */
export default async function MyPerformancePage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== "AGENT" && session.role !== "MANAGER") return null;

  const seller = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!seller) return null;

  const [leads, calls, assignedToday, monthly] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId: session.orgId, ownerId: session.sub },
      include: { contact: true, stage: true },
      orderBy: { lastActivityAt: "desc" },
    }),
    prisma.call.findMany({
      where: { organizationId: session.orgId, agentId: session.sub },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.activity.findMany({
      where: {
        organizationId: session.orgId,
        type: "LEAD_ASSIGNED",
        createdAt: { gte: startOfToday() },
        lead: { ownerId: session.sub },
      },
      select: { leadId: true },
    }),
    getMonthlyPerformance(session.sub),
  ]);

  const todayLeadCount = new Set(assignedToday.map((a) => a.leadId)).size;

  return <SellerProfile seller={seller} leads={leads} calls={calls} todayLeadCount={todayLeadCount} monthly={monthly} />;
}
