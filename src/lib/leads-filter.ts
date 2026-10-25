import type { Prisma, LeadCategory } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { isAdmin, leadWhereForSession } from "@/lib/access";
import { localDateBoundary } from "@/lib/format";

export type LeadsFilterParams = {
  q?: string;
  stageId?: string;
  ownerId?: string;
  createdById?: string;
  category?: string;
  from?: string;
  to?: string;
  tzOffset?: string;
  assigned?: string;
  idCountry?: string;
  clientCountry?: string;
  contactInfo?: string;
};

/**
 * The Leads list's where-clause, shared with the Excel export so the two
 * can never drift apart — whatever filters are active on the page are
 * exactly what gets exported when "Export" is clicked from it.
 */
export function buildLeadsWhereClause(
  session: SessionPayload,
  params: LeadsFilterParams,
  newStageId: string
): Prisma.LeadWhereInput {
  const { q, stageId, ownerId, createdById, category, from, to, tzOffset, assigned, idCountry, clientCountry, contactInfo } =
    params;
  const tzOffsetMinutes = Number(tzOffset) || 0;
  const admin = isAdmin(session.role);
  const visWhere = leadWhereForSession(session);

  return {
    organizationId: session.orgId,
    ...visWhere,
    ...(stageId ? { stageId } : {}),
    ...(category ? { category: category as LeadCategory } : {}),
    ...(admin && createdById ? { createdById } : {}),
    ...(admin && ownerId
      ? { ownerId }
      : admin && assigned === "yes"
        ? { ownerId: { not: null } }
        : admin && assigned === "no"
          ? { ownerId: null }
          : admin && assigned === "new"
            ? { stageId: newStageId }
            : {}),
    ...(idCountry ? { country: { equals: idCountry, mode: "insensitive" } } : {}),
    ...(clientCountry ? { clientCountry: { equals: clientCountry, mode: "insensitive" } } : {}),
    ...(admin && contactInfo === "emailOnly" ? { contact: { email: { not: null }, phone: null } } : {}),
    ...(admin && contactInfo === "phoneOnly" ? { contact: { phone: { not: null }, email: null } } : {}),
    ...(admin && contactInfo === "phoneMandatory" ? { contact: { phone: { not: null } } } : {}),
    ...(admin && (from || to)
      ? {
          createdAt: {
            ...(from ? { gte: localDateBoundary(from, tzOffsetMinutes) } : {}),
            ...(to ? { lte: localDateBoundary(to, tzOffsetMinutes, true) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { idName: { contains: q, mode: "insensitive" } },
            { websiteUrl: { contains: q, mode: "insensitive" } },
            { clientCountry: { contains: q, mode: "insensitive" } },
            {
              contact: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };
}
