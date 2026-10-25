import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { getFirstStage } from "@/lib/pipeline";
import { buildLeadsWhereClause, type LeadsFilterParams } from "@/lib/leads-filter";
import { LEAD_CATEGORY_LABELS, type LeadCategoryValue } from "@/lib/categories";
import { formatDateTime } from "@/lib/format";

/** Wraps a field in quotes and escapes embedded quotes whenever it needs
 * it (contains a comma, quote, or newline) — plain values are left bare
 * so the file stays readable, same as what Excel/Sheets produce themselves. */
function csvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = [
  "Client name",
  "Phone",
  "Email",
  "ID name",
  "ID URL",
  "Website",
  "ID country",
  "Client country",
  "Category",
  "Stage",
  "Status note",
  "Price",
  "Owner",
  "Entered by",
  "Delivery date",
  "Last activity",
] as const;

/**
 * Exports the lead list — lead details only, no calls/messages/tasks — as a
 * CSV, which Excel opens natively. Reuses the same where-clause as the
 * Leads page (buildLeadsWhereClause) so whatever filters are active there
 * are exactly what gets exported, with no row cap (the page itself caps
 * the table at 200 for display, but a download shouldn't be capped).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const params: LeadsFilterParams = Object.fromEntries(searchParams.entries());
  const { stage: newStage } = await getFirstStage(session.orgId);
  const where = buildLeadsWhereClause(session, params, newStage.id);

  const leads = await prisma.lead.findMany({
    where,
    include: { contact: true, stage: true, owner: true, createdBy: true },
    orderBy: { lastActivityAt: "desc" },
  });

  const rows = leads.map((lead) =>
    [
      lead.contact.firstName,
      lead.contact.phone,
      lead.contact.email,
      lead.idName,
      lead.idUrl,
      lead.websiteUrl,
      lead.country,
      lead.clientCountry,
      lead.category ? LEAD_CATEGORY_LABELS[lead.category as LeadCategoryValue] : null,
      lead.stage.name,
      lead.statusNote,
      lead.price != null ? Number(lead.price) : null,
      lead.owner?.name ?? "Unassigned",
      lead.createdBy?.name ?? null,
      lead.deliveryDate ? lead.deliveryDate.toISOString().slice(0, 10) : null,
      formatDateTime(lead.lastActivityAt),
    ]
      .map(csvField)
      .join(",")
  );

  // A UTF-8 BOM so Excel (Windows in particular) detects the encoding
  // correctly instead of mangling non-ASCII client names.
  const csv = "﻿" + [COLUMNS.join(","), ...rows].join("\r\n");
  const filename = `leads-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
