import { prisma } from "@/lib/prisma";
import { getPrimaryOrganizationId } from "@/lib/org";

/**
 * Two CRMs in one app:
 *  - CRM A — the primary org. Every user account and integration lives
 *    here, and every inbound lead (webhooks, email, Zoom) always lands here.
 *  - CRM B — a second, empty org whose leads are entered by hand.
 *
 * The admin "Switch" button flips Organization.activeWorkspaceId on CRM A,
 * and getSession() points every logged-in user's data queries at whichever
 * CRM is active — nobody has to log in again.
 */
export const CRM_B_NAME = "CRM B";

export async function getActiveWorkspaceId() {
  const primaryId = await getPrimaryOrganizationId();
  const primary = await prisma.organization.findUnique({
    where: { id: primaryId },
    select: { activeWorkspaceId: true },
  });
  return primary?.activeWorkspaceId ?? primaryId;
}

/**
 * CRM B is created on the first switch: a fresh org with a copy of CRM A's
 * default pipeline stages (so leads have somewhere to go) and nothing else.
 */
async function getOrCreateCrmB(primaryId: string) {
  const existing = await prisma.organization.findFirst({
    where: { id: { not: primaryId } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const sourcePipeline = await prisma.pipeline.findFirst({
    where: { organizationId: primaryId, isDefault: true },
    include: { stages: { orderBy: { order: "asc" } } },
  });

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: CRM_B_NAME } });
    await tx.pipeline.create({
      data: {
        organizationId: org.id,
        name: sourcePipeline?.name ?? "Sales Pipeline",
        isDefault: true,
        stages: {
          create: (sourcePipeline?.stages ?? []).map((s) => ({
            name: s.name,
            order: s.order,
            isWon: s.isWon,
            isLost: s.isLost,
          })),
        },
      },
    });
    return org.id;
  });
}

/** Moves everyone to CRM B, or back to CRM A. Returns the now-active org id. */
export async function switchWorkspace(target: "A" | "B") {
  const primaryId = await getPrimaryOrganizationId();
  const activeId = target === "B" ? await getOrCreateCrmB(primaryId) : primaryId;
  await prisma.organization.update({
    where: { id: primaryId },
    data: { activeWorkspaceId: target === "B" ? activeId : null },
  });
  return activeId;
}
