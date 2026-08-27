import { prisma } from "@/lib/prisma";

/**
 * Simple round-robin router: assigns to whichever active agent in the org
 * currently owns the fewest open leads. Good enough for an MVP; the brief's
 * "smarter" routing (territory, workload, language, conversion rate) can
 * layer on top of this same entry point later.
 */
export async function pickNextAgent(organizationId: string): Promise<string | null> {
  const agents = await prisma.user.findMany({
    where: { organizationId, active: true, role: { in: ["AGENT", "MANAGER"] } },
    select: {
      id: true,
      _count: { select: { ownedLeads: { where: { status: "OPEN" } } } },
    },
  });

  if (agents.length === 0) return null;

  agents.sort((a, b) => a._count.ownedLeads - b._count.ownedLeads);
  return agents[0].id;
}
