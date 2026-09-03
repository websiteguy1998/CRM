import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import StageBadge from "@/components/stage-badge";
import ScoreBadge from "@/components/score-badge";
import NewLeadDialog from "@/components/new-lead-dialog";
import OwnerSelector from "@/components/owner-selector";
import DeleteLeadButton from "@/components/delete-lead-button";
import TimezoneOffsetInput from "@/components/timezone-offset-input";
import { formatCurrency, formatDateTime, localDateBoundary, relativeTime } from "@/lib/format";
import { isAdmin, leadWhereForSession } from "@/lib/access";
import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS } from "@/lib/categories";
import type { LeadCategory } from "@prisma/client";

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

function assignedTabHref(params: LeadsSearchParams, value: "" | "yes" | "no") {
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
  const { q, stageId, ownerId, createdById, category, from, to, tzOffset, assigned, idCountry, clientCountry } =
    params;
  const tzOffsetMinutes = Number(tzOffset) || 0;
  const admin = isAdmin(session.role);
  const entryOnly = session.role === "LEAD_ENTRY";
  const visWhere = leadWhereForSession(session);

  const [leads, stages, owners, enterers, idCountryRows, clientCountryRows] = await Promise.all([
    prisma.lead.findMany({
      where: {
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
              : {}),
        ...(idCountry ? { country: { equals: idCountry, mode: "insensitive" } } : {}),
        ...(clientCountry ? { clientCountry: { equals: clientCountry, mode: "insensitive" } } : {}),
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
      },
      include: { contact: true, stage: true, owner: true, createdBy: true },
      orderBy: { lastActivityAt: "desc" },
      take: 200,
    }),
    prisma.pipelineStage.findMany({
      where: { pipeline: { organizationId: session.orgId, isDefault: true } },
      orderBy: { order: "asc" },
    }),
    prisma.user.findMany({ where: { organizationId: session.orgId, active: true } }),
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
  ]);

  const idCountryOptions = dedupeCaseInsensitive(idCountryRows.map((r) => r.country));
  const clientCountryOptions = dedupeCaseInsensitive(clientCountryRows.map((r) => r.clientCountry));

  return (
    <div>
      <PageHeader
        title="Leads"
        description={
          entryOnly ? `${leads.length} leads you entered in the last 24 hours` : `${leads.length} leads`
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
                ["", "All leads"],
                ["yes", "Assigned leads"],
                ["no", "Unassigned leads"],
              ] as const
            ).map(([value, label]) => {
              const active = (assigned ?? "") === value;
              return (
                <Link
                  key={value || "all"}
                  href={assignedTabHref(params, value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label}
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
          {admin && (
            <>
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

        <div className="card overflow-x-auto">
          {/* table-fixed + explicit column widths so one cell with unbreakable
              long content (a huge Fiverr delivery-asset URL, say) can never
              blow the whole table's column widths out again — it just
              truncates with an ellipsis inside its own column instead. */}
          <table className="w-full min-w-[1500px] table-fixed text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] text-slate-500">
                {(admin || entryOnly) && <th className="w-8 px-2.5 py-1.5 font-medium"></th>}
                <th className="w-28 px-2.5 py-1.5 font-medium">ID name</th>
                <th className="w-48 px-2.5 py-1.5 font-medium">Client</th>
                <th className="w-40 px-2.5 py-1.5 font-medium">Website</th>
                <th className="w-20 px-2.5 py-1.5 font-medium">Price</th>
                {!entryOnly && <th className="w-36 px-2.5 py-1.5 font-medium">Seller</th>}
                <th className="w-24 px-2.5 py-1.5 font-medium">Delivery</th>
                <th className="w-40 px-2.5 py-1.5 font-medium">ID URL</th>
                <th className="w-16 px-2.5 py-1.5 font-medium">ID Country</th>
                <th className="w-20 px-2.5 py-1.5 font-medium">Client country</th>
                <th className="w-28 px-2.5 py-1.5 font-medium">Category</th>
                <th className="w-24 px-2.5 py-1.5 font-medium">Stage</th>
                {!entryOnly && <th className="w-32 px-2.5 py-1.5 font-medium">Status</th>}
                {admin && <th className="w-24 px-2.5 py-1.5 font-medium">Entered by</th>}
                <th className="w-20 px-2.5 py-1.5 font-medium">Last activity</th>
                {admin && <th className="w-12 px-2.5 py-1.5 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  {(admin || entryOnly) && (
                    <td className="px-2.5 py-1">
                      <Link
                        href={`/leads/${lead.id}`}
                        title="Edit lead"
                        aria-label="Edit lead"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                      >
                        ✏️
                      </Link>
                    </td>
                  )}
                  <td className="truncate px-2.5 py-1 text-slate-600" title={lead.idName ?? undefined}>
                    {lead.idName ?? "—"}
                  </td>
                  <td className="px-2.5 py-1">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="block truncate font-medium text-slate-800 hover:underline"
                    >
                      {lead.contact.firstName}
                    </Link>
                    <div className="truncate text-[11px] text-slate-400">
                      {lead.contact.phone && <span>{lead.contact.phone}</span>}
                      {lead.contact.phone && lead.contact.email && <span> · </span>}
                      {lead.contact.email && <span>{lead.contact.email}</span>}
                    </div>
                  </td>
                  <td className="px-2.5 py-1 text-slate-600">
                    {lead.websiteUrl ? (
                      <a
                        href={lead.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={lead.websiteUrl}
                        className="block break-all text-indigo-600 hover:underline"
                      >
                        {lead.websiteUrl.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="truncate px-2.5 py-1 text-slate-600">
                    {lead.price != null ? formatCurrency(Number(lead.price)) : "—"}
                  </td>
                  {!entryOnly && (
                    <td className="overflow-hidden px-2.5 py-1">
                      {admin ? (
                        <OwnerSelector
                          leadId={lead.id}
                          owners={owners
                            .filter((o) => o.role === "AGENT" || o.role === "MANAGER")
                            .map((o) => ({ id: o.id, name: o.name }))}
                          currentOwnerId={lead.ownerId}
                          compact
                        />
                      ) : (
                        <span className="text-slate-600">{lead.owner?.name ?? "Unassigned"}</span>
                      )}
                    </td>
                  )}
                  <td className="truncate px-2.5 py-1 text-slate-600">
                    {lead.deliveryDate ? formatDateTime(lead.deliveryDate) : "—"}
                  </td>
                  <td className="px-2.5 py-1 text-slate-600">
                    {lead.idUrl ? (
                      <a
                        href={lead.idUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={lead.idUrl}
                        className="block break-all text-indigo-600 hover:underline"
                      >
                        {lead.idUrl.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="truncate px-2.5 py-1 text-slate-600" title={lead.country ?? undefined}>
                    {lead.country ?? "—"}
                  </td>
                  <td className="truncate px-2.5 py-1 text-slate-600" title={lead.clientCountry ?? undefined}>
                    {lead.clientCountry ?? "—"}
                  </td>
                  <td className="truncate px-2.5 py-1 text-slate-600">
                    {lead.category ? LEAD_CATEGORY_LABELS[lead.category] : "—"}
                  </td>
                  <td className="px-2.5 py-1">
                    <StageBadge name={lead.stage.name} isWon={lead.stage.isWon} isLost={lead.stage.isLost} />
                  </td>
                  {!entryOnly && (
                    <td className="truncate px-2.5 py-1 text-slate-600" title={lead.statusNote ?? undefined}>
                      {lead.statusNote ?? "—"}
                    </td>
                  )}
                  {admin && (
                    <td className="truncate px-2.5 py-1 text-slate-600">{lead.createdBy?.name ?? "—"}</td>
                  )}
                  <td className="truncate px-2.5 py-1 text-slate-400">{relativeTime(lead.lastActivityAt)}</td>
                  {admin && (
                    <td className="px-2.5 py-1">
                      <DeleteLeadButton leadId={lead.id} name={lead.contact.firstName} />
                    </td>
                  )}
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td
                    colSpan={11 + (entryOnly ? 0 : 2) + (admin ? 2 : 0) + (admin || entryOnly ? 1 : 0)}
                    className="px-2.5 py-10 text-center text-slate-400"
                  >
                    No leads yet. Add one or import a CSV to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
