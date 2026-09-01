import { prisma } from "@/lib/prisma";

/**
 * People fill blank sheet cells with "-", "n/a", etc. If that gets typed
 * into an identifying field (phone/email/website) and stored as a real
 * value, every subsequent lead with the same placeholder would match as a
 * "duplicate" of the first one that had it. Treat those as empty
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

/** A client can have more than one email — the field stores a comma/semicolon separated list, each checked individually. */
export function isValidEmailList(value: string): boolean {
  return value
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
    .every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

/**
 * Duplicate check on the fields that genuinely identify one client:
 * phone, email, and website. Everything else on a lead (client name, ID
 * name/URL, country, price, delivery date, duration, status) can
 * legitimately repeat across different leads — e.g. the same Fiverr
 * profile URL can be attached to more than one lead — so only these
 * three ever block a create.
 */
export async function findDuplicateLead(
  organizationId: string,
  fields: { phone?: string; email?: string; websiteUrl?: string }
) {
  const phone = normalizeIdentifyingField(fields.phone);
  const email = normalizeIdentifyingField(fields.email);
  const websiteUrl = normalizeIdentifyingField(fields.websiteUrl);

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

  if (!websiteUrl) return null;

  return prisma.lead.findFirst({
    where: { organizationId, websiteUrl },
    orderBy: { createdAt: "desc" },
    include: { createdBy: true },
  });
}
