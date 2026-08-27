import { prisma } from "@/lib/prisma";

/**
 * This MVP runs a single organization, so anything that needs an org
 * before a user/session exists (inbound webhooks, public signup) resolves
 * to "the org" this way. A real multi-tenant deployment would resolve it
 * from the request instead (subdomain, webhook payload, etc).
 */
export async function getPrimaryOrganizationId() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw new Error("No organization configured");
  return org.id;
}
