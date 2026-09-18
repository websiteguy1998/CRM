import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SellerProfile from "@/components/seller-profile";
import { isAdmin } from "@/lib/access";
import { getMonthlyPerformance } from "@/lib/performance";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function SellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;
  if (!isAdmin(session.role)) return null;
  const { id } = await params;

  const seller = await prisma.user.findFirst({
    where: { id, organizationId: session.orgId, role: { in: ["AGENT", "MANAGER"] } },
  });
  if (!seller) notFound();

  const [leads, calls, assignedToday, monthly] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId: session.orgId, ownerId: seller.id },
      include: { contact: true, stage: true },
      orderBy: { lastActivityAt: "desc" },
    }),
    prisma.call.findMany({
      where: { organizationId: session.orgId, agentId: seller.id },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.activity.findMany({
      where: {
        organizationId: session.orgId,
        type: "LEAD_ASSIGNED",
        createdAt: { gte: startOfToday() },
        lead: { ownerId: seller.id },
      },
      select: { leadId: true },
    }),
    getMonthlyPerformance(seller.id),
  ]);

  const todayLeadCount = new Set(assignedToday.map((a) => a.leadId)).size;

  return (
    <SellerProfile
      seller={seller}
      leads={leads}
      calls={calls}
      todayLeadCount={todayLeadCount}
      monthly={monthly}
      actions={
        <Link href="/sellers" className="btn-secondary">
          ← All sellers
        </Link>
      }
    />
  );
}
