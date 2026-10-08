import { prisma } from "@/lib/prisma";
import { getPrimaryOrganizationId } from "@/lib/org";

/**
 * Two CRMs in one app, on two URLs (see lib/crm.ts):
 *  - CRM A — the primary org, at the site root. Every user account and
 *    integration lives here, and every inbound lead (webhooks, email, Zoom)
 *    always lands here.
 *  - CRM B — a second, empty org at /crm-b whose leads are entered by hand.
 *    Same user accounts, but its own login cookie.
 *
 * The admin "Switch" button in CRM A logs everyone out of CRM A and hands
 * each of them a CRM B login on their next page load (see
 * /api/auth/handoff). CRM A is then only reachable by signing in at its URL.
 */
export const CRM_B_NAME = "CRM B";


/**
 * CRM B's org id. It's created the first time anyone needs it: a fresh org
 * with a copy of CRM A's default pipeline stages (so leads have somewhere
 * to go) and nothing else.
 */
export async function getCrmBOrgId(primaryId: string) {
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

/**
 * The Switch: every CRM A login issued before now stops working in CRM A,
 * and activeWorkspaceId marks that those logins should be handed over to
 * CRM B instead of sent to the CRM A login page.
 */
export async function switchEveryoneToCrmB() {
  const primaryId = await getPrimaryOrganizationId();
  const crmBId = await getCrmBOrgId(primaryId);
  await prisma.organization.update({
    where: { id: primaryId },
    data: { activeWorkspaceId: crmBId, sessionsInvalidatedAt: new Date() },
  });
}
