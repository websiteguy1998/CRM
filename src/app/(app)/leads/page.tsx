import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import NewLeadDialog from "@/components/new-lead-dialog";
import LeadsTable from "@/components/leads-table";
import TimezoneOffsetInput from "@/components/timezone-offset-input";
import { localDateBoundary } from "@/lib/format";
import { isAdmin, leadWhereForSession } from "@/lib/access";
import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS } from "@/lib/categories";
import { getFirstStage } from "@/lib/pipeline";
import type { LeadCategory, Prisma } from "@prisma/client";

type LeadsSearchParams = {
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
  sort?: string;
  contactInfo?: string;
};

/** Country values get typed inconsistently ("Pak" / "PAK" / "pak") — group
 * them case-insensitively for the filter dropdown so the same country
 * doesn't show up as three separate options. */
function dedupeCaseInsensitive(values: (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (!seen.has(key)) seen.set(key, v);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

function assignedTabHref(params: LeadsSearchParams, value: "" | "yes" | "no" | "new") {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (key !== "assigned" && val) qs.set(key, val);
  }
  if (value) qs.set("assigned", value);
  const query = qs.toString();
  return `/leads${query ? `?${query}` : ""}`;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<LeadsSearchParams>;
}) {
  const session = await getSession();
  if (!session) return null;
  const params = await searchParams;
  const {
    q,
    stageId,
    ownerId,
    createdById,
    category,
    from,
    to,
    tzOffset,
    assigned,
    idCountry,
    clientCountry,
    sort,
    contactInfo,
  } = params;
  const tzOffsetMinutes = Number(tzOffset) || 0;
  const admin = isAdmin(session.role);
  const entryOnly = session.role === "LEAD_ENTRY";
  const visWhere = leadWhereForSession(session);
  const { stage: newStage } = await getFirstStage(session.orgId);

  const leadWhereClause: Prisma.LeadWhereInput = {
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
            ? { stageId: newStage.id }
            : {}),
    ...(idCountry ? { country: { equals: idCountry, mode: "insensitive" } } : {}),
    ...(clientCountry ? { clientCountry: { equals: clientCountry, mode: "insensitive" } } : {}),
    ...(admin && contactInfo === "emailOnly" ? { contact: { email: { not: null }, phone: null } } : {}),
    ...(admin && contactInfo === "phoneOnly" ? { contact: { phone: { not: null }, email: null } } : {}),
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

  const [
    leads,
    leadCount,
    stages,
    owners,
    enterers,
    idCountryRows,
    clientCountryRows,
    allCount,
    assignedCount,
    unassignedCount,
    newCount,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhereClause,
      include: { contact: true, stage: true, owner: true, createdBy: true },
      orderBy:
        sort === "deliveryDesc"
          ? { deliveryDate: { sort: "desc", nulls: "last" } }
          : sort === "deliveryAsc"
            ? { deliveryDate: { sort: "asc", nulls: "last" } }
            : { lastActivityAt: "desc" },
      take: 200,
    }),
    // Accurate total for this exact filter set — the list above is capped
    // at 200 rows for the table itself, but the count shown in the header
    // shouldn't be.
    prisma.lead.count({ where: leadWhereClause }),
    prisma.pipelineStage.findMany({
      where: { pipeline: { organizationId: session.orgId, isDefault: true } },
      orderBy: { order: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: session.orgId, active: true },
      select: { id: true, name: true, role: true },
    }),
    admin
      ? prisma.user.findMany({
          where: { organizationId: session.orgId, active: true, role: { in: ["ADMIN", "LEAD_ENTRY"] } },
        })
      : Promise.resolve([]),
    prisma.lead.findMany({
      where: { organizationId: session.orgId, ...visWhere, country: { not: null } },
      select: { country: true },
      distinct: ["country"],
    }),
    prisma.lead.findMany({
      where: { organizationId: session.orgId, ...visWhere, clientCountry: { not: null } },
      select: { clientCountry: true },
      distinct: ["clientCountry"],
    }),
    // Stable badge counts for the tabs below — scoped only by visibility,
    // not by whatever search/category/etc. filters happen to be active,
    // so they read like inbox-folder totals rather than shifting under you.
    admin
      ? prisma.lead.count({ where: { organizationId: session.orgId, ...visWhere } })
      : Promise.resolve(0),
    admin
      ? prisma.lead.count({ where: { organizationId: session.orgId, ...visWhere, ownerId: { not: null } } })
      : Promise.resolve(0),
    admin
      ? prisma.lead.count({ where: { organizationId: session.orgId, ...visWhere, ownerId: null } })
      : Promise.resolve(0),
    admin
      ? prisma.lead.count({ where: { organizationId: session.orgId, ...visWhere, stageId: newStage.id } })
      : Promise.resolve(0),
  ]);

  const idCountryOptions = dedupeCaseInsensitive(idCountryRows.map((r) => r.country));
  const clientCountryOptions = dedupeCaseInsensitive(clientCountryRows.map((r) => r.clientCountry));

  // Serialize for the client table: Prisma's Decimal/Date types don't cross
  // the server/client boundary as plain data.
  const leadRows = leads.map((lead) => ({
    id: lead.id,
    idName: lead.idName,
    contact: { firstName: lead.contact.firstName, phone: lead.contact.phone, email: lead.contact.email },
    websiteUrl: lead.websiteUrl,
    price: lead.price != null ? Number(lead.price) : null,
    ownerId: lead.ownerId,
    owner: lead.owner ? { name: lead.owner.name } : null,
    deliveryDate: lead.deliveryDate ? lead.deliveryDate.toISOString() : null,
    idUrl: lead.idUrl,
    country: lead.country,
    clientCountry: lead.clientCountry,
    category: lead.category,
    stageId: lead.stageId,
    stage: { name: lead.stage.name, isWon: lead.stage.isWon, isLost: lead.stage.isLost },
    statusNote: lead.statusNote,
    createdBy: lead.createdBy ? { name: lead.createdBy.name } : null,
    lastActivityAt: lead.lastActivityAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Leads"
        description={
          entryOnly ? `${leadCount} leads you entered in the last 24 hours` : `${leadCount} leads`
        }
        actions={
          <>
            {admin && (
              <Link href="/leads/import" className="btn-secondary">
                Import CSV
              </Link>
            )}
            {(admin || entryOnly) && <NewLeadDialog />}
          </>
        }
      />
      <div className="p-6">
        {admin && (
          <div className="mb-3 flex gap-1.5">
            {(
              [
                ["", "All leads", allCount],
                ["new", "New leads", newCount],
                ["yes", "Assigned leads", assignedCount],
                ["no", "Unassigned leads", unassignedCount],
              ] as const
            ).map(([value, label, count]) => {
              const active = (assigned ?? "") === value;
              return (
                <Link
                  key={value || "all"}
                  href={assignedTabHref(params, value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label} ({count})
                </Link>
              );
            })}
          </div>
        )}

        <form className="mb-4 flex flex-wrap gap-2" method="GET">
          <TimezoneOffsetInput />
          {assigned && <input type="hidden" name="assigned" value={assigned} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search client, country, ID name, website…"
            className="input max-w-xs"
          />
          <select name="stageId" defaultValue={stageId ?? ""} className="input max-w-[160px]">
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={category ?? ""} className="input max-w-[160px]">
            <option value="">All categories</option>
            {LEAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {LEAD_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select name="idCountry" defaultValue={idCountry ?? ""} className="input max-w-[150px]">
            <option value="">All ID countries</option>
            {idCountryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select name="clientCountry" defaultValue={clientCountry ?? ""} className="input max-w-[150px]">
            <option value="">All client countries</option>
            {clientCountryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={sort ?? ""} className="input max-w-[190px]">
            <option value="">Sort: Last activity</option>
            <option value="deliveryDesc">Delivery date: newest first</option>
            <option value="deliveryAsc">Delivery date: oldest first</option>
          </select>
          {admin && (
            <>
              <select name="contactInfo" defaultValue={contactInfo ?? ""} className="input max-w-[190px]">
                <option value="">All contact info</option>
                <option value="emailOnly">Email only (no phone)</option>
                <option value="phoneOnly">Phone only (no email)</option>
              </select>
              <select name="ownerId" defaultValue={ownerId ?? ""} className="input max-w-[160px]">
                <option value="">All sellers</option>
                {owners
                  .filter((o) => o.role === "AGENT" || o.role === "MANAGER")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
              <select name="createdById" defaultValue={createdById ?? ""} className="input max-w-[160px]">
                <option value="">Entered by anyone</option>
                {enterers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <input type="date" name="from" defaultValue={from} className="input max-w-[150px]" />
              <input type="date" name="to" defaultValue={to} className="input max-w-[150px]" />
            </>
          )}
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>

        <LeadsTable leads={leadRows} stages={stages} owners={owners} admin={admin} entryOnly={entryOnly} />
      </div>
    </div>
  );
}
