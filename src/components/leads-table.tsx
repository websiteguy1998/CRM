"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StageBadge from "@/components/stage-badge";
import StageSelector from "@/components/stage-selector";
import OwnerSelector from "@/components/owner-selector";
import StatusNoteEditor from "@/components/status-note-editor";
import DeleteLeadButton from "@/components/delete-lead-button";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/format";
import { LEAD_CATEGORY_LABELS, type LeadCategoryValue } from "@/lib/categories";

export type LeadRow = {
  id: string;
  idName: string | null;
  contact: { firstName: string; phone: string | null; email: string | null };
  websiteUrl: string | null;
  price: number | null;
  ownerId: string | null;
  owner: { name: string } | null;
  deliveryDate: string | null;
  idUrl: string | null;
  country: string | null;
  clientCountry: string | null;
  category: LeadCategoryValue | null;
  stageId: string;
  stage: { name: string; isWon: boolean; isLost: boolean };
  statusNote: string | null;
  createdBy: { name: string } | null;
  lastActivityAt: string;
};

export default function LeadsTable({
  leads,
  stages,
  owners,
  admin,
  entryOnly,
}: {
  leads: LeadRow[];
  stages: { id: string; name: string }[];
  owners: { id: string; name: string; role: string }[];
  admin: boolean;
  entryOnly: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const sellers = owners.filter((o) => o.role === "AGENT" || o.role === "MANAGER");

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAssign() {
    if (!bulkOwnerId || selected.size === 0) return;
    setAssigning(true);
    try {
      await fetch("/api/leads/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: Array.from(selected), ownerId: bulkOwnerId }),
      });
      setSelected(new Set());
      setBulkOwnerId("");
      router.refresh();
    } finally {
      setAssigning(false);
    }
  }

  const emptyColSpan =
    11 + (admin ? 1 : 0) + (entryOnly ? 0 : 2) + (admin ? 2 : 0) + (admin || entryOnly ? 1 : 0);

  return (
    <>
      {admin && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
          <span className="text-xs font-medium text-indigo-800">{selected.size} lead(s) selected</span>
          <select
            value={bulkOwnerId}
            onChange={(e) => setBulkOwnerId(e.target.value)}
            className="input max-w-[180px]"
          >
            <option value="">Assign to seller…</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={bulkAssign}
            disabled={!bulkOwnerId || assigning}
            className="btn-primary text-xs"
          >
            {assigning ? "Assigning…" : "Assign"}
          </button>
          <button onClick={() => setSelected(new Set())} className="btn-ghost text-xs">
            Clear selection
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        {/* table-fixed + explicit column widths so one cell with unbreakable
            long content (a huge Fiverr delivery-asset URL, say) can never
            blow the whole table's column widths out again — it just
            truncates with an ellipsis inside its own column instead. */}
        <table className="w-full min-w-[1500px] table-fixed text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] text-slate-500">
              {admin && (
                <th className="w-8 px-2.5 py-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    aria-label="Select all leads"
                  />
                </th>
              )}
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
              <th className="w-32 px-2.5 py-1.5 font-medium">Stage</th>
              {!entryOnly && <th className="w-32 px-2.5 py-1.5 font-medium">Status</th>}
              {admin && <th className="w-24 px-2.5 py-1.5 font-medium">Entered by</th>}
              <th className="w-20 px-2.5 py-1.5 font-medium">Last activity</th>
              {admin && <th className="w-12 px-2.5 py-1.5 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                {admin && (
                  <td className="px-2.5 py-1">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      aria-label={`Select ${lead.contact.firstName}`}
                    />
                  </td>
                )}
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
                  {lead.price != null ? formatCurrency(lead.price) : "—"}
                </td>
                {!entryOnly && (
                  <td className="overflow-hidden px-2.5 py-1">
                    {admin ? (
                      <OwnerSelector
                        leadId={lead.id}
                        owners={sellers.map((o) => ({ id: o.id, name: o.name }))}
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
                <td className="overflow-hidden px-2.5 py-1">
                  {entryOnly ? (
                    <StageBadge name={lead.stage.name} isWon={lead.stage.isWon} isLost={lead.stage.isLost} />
                  ) : (
                    <StageSelector leadId={lead.id} stages={stages} currentStageId={lead.stageId} compact />
                  )}
                </td>
                {!entryOnly && (
                  <td className="px-1 py-1">
                    <StatusNoteEditor leadId={lead.id} initialValue={lead.statusNote} />
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
                <td colSpan={emptyColSpan} className="px-2.5 py-10 text-center text-slate-400">
                  No leads yet. Add one or import a CSV to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
