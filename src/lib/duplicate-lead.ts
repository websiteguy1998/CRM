import { prisma } from "@/lib/prisma";

/**
 * People fill blank sheet cells with "-", "n/a", etc. If that gets typed
 * into an identifying field (phone/email/website/ID URL) and stored as a
 * real value, every subsequent lead with the same placeholder would match
 * as a "duplicate" of the first one that had it. Treat those as empty
 * everywhere an identifying field is read from user input — both for the
 * duplicate check and before saving, so the placeholder never gets stored
 * as if it meant something.
 */
export function normalizeIdentifyingField(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^[-–—.]+$/.test(trimmed)) return undefined; // "-", "--", "n/a"-style dashes
  if (/^n\/?a$/i.test(trimmed) || /^none$/i.test(trimmed)) return undefined;
  return trimmed;
}

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
  const phone = normalizeIdentifyingField(fields.phone);
  const email = normalizeIdentifyingField(fields.email);
  const websiteUrl = normalizeIdentifyingField(fields.websiteUrl);
  const idUrl = normalizeIdentifyingField(fields.idUrl);
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
