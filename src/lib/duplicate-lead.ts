import { prisma } from "@/lib/prisma";

/**
 * The one thing every lead-entry person must be warned about: someone else
 * (or themselves, earlier) may have already logged this exact client.
 * Matches on phone, email, or website/profile URL — whichever is present —
 * since a sheet row rarely has all of them filled in.
 */
export async function findDuplicateLead(
  organizationId: string,
  fields: { phone?: string; email?: string; websiteUrl?: string; idUrl?: string }
) {
  const { phone, email, websiteUrl, idUrl } = fields;
  const or: Array<Record<string, unknown>> = [];

  if (phone || email) {
    const contact = await prisma.contact.findFirst({
      where: {
        organizationId,
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
      },
      include: { leads: { orderBy: { createdAt: "desc" }, take: 1, include: { createdBy: true } } },
    });
    if (contact?.leads[0]) return contact.leads[0];
  }

  if (websiteUrl) or.push({ websiteUrl });
  if (idUrl) or.push({ idUrl });
  if (or.length === 0) return null;

  return prisma.lead.findFirst({
    where: { organizationId, OR: or },
    orderBy: { createdAt: "desc" },
    include: { createdBy: true },
  });
}
