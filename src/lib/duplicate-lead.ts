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
 * Website URLs get typed inconsistently across years of manual entry —
 * "https://example.com", "example.com/", "www.Example.com" and
 * "EXAMPLE.COM" are all the same site, but an exact string match on the
 * stored value would treat them as different. Strip protocol, a leading
 * "www.", trailing slashes, and case so the same domain always compares
 * equal regardless of how it was originally typed.
 */
export function normalizeWebsiteUrl(value?: string | null): string | undefined {
  const trimmed = normalizeIdentifyingField(value);
  if (!trimmed) return undefined;
  const normalized = trimmed
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  return normalized || undefined;
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
  const websiteUrl = normalizeWebsiteUrl(fields.websiteUrl);

  if (phone || email) {
    const contact = await prisma.contact.findFirst({
      where: {
        organizationId,
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ],
      },
      include: { leads: { orderBy: { createdAt: "desc" }, take: 1, include: { createdBy: true, contact: true } } },
    });
    if (contact?.leads[0]) return contact.leads[0];
  }

  if (!websiteUrl) return null;

  // An exact column match would miss the same site typed with a different
  // protocol/www/trailing-slash/case — that's most of what "day one"
  // manually-entered data looks like. Compare normalized forms across
  // every lead that has a website, not just a literal string match.
  const candidates = await prisma.lead.findMany({
    where: { organizationId, websiteUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { createdBy: true, contact: true },
  });
  return candidates.find((lead) => normalizeWebsiteUrl(lead.websiteUrl) === websiteUrl) ?? null;
}
