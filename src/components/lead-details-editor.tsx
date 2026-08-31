"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS, type LeadCategoryValue } from "@/lib/categories";

type LeadDetails = {
  clientName: string;
  phone: string | null;
  email: string | null;
  idName: string | null;
  idUrl: string | null;
  country: string | null;
  clientCountry: string | null;
  websiteUrl: string | null;
  deliveryDate: string | null;
  price: string | null;
  duration: string | null;
  statusNote: string | null;
  category: LeadCategoryValue | null;
};

export default function LeadDetailsEditor({
  leadId,
  details,
  editable,
}: {
  leadId: string;
  details: LeadDetails;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.get("clientName") || undefined,
          phone: form.get("phone") ?? "",
          email: form.get("email") ?? "",
          idName: form.get("idName") || undefined,
          idUrl: form.get("idUrl") || undefined,
          country: form.get("country") || undefined,
          clientCountry: form.get("clientCountry") || undefined,
          websiteUrl: form.get("websiteUrl") || undefined,
          deliveryDate: form.get("deliveryDate") || undefined,
          price: form.get("price") || undefined,
          duration: form.get("duration") || undefined,
          statusNote: form.get("statusNote") || undefined,
          category: form.get("category") || undefined,
        }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const row = (label: string, value: string | null) => (
    <div className="flex items-center justify-between border-b border-slate-50 py-1.5 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800">{value || "—"}</span>
    </div>
  );

  if (!editing) {
    return (
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Lead details</h2>
          {editable && (
            <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
              Edit
            </button>
          )}
        </div>
        <div className="text-sm">
          {row("Category", details.category ? LEAD_CATEGORY_LABELS[details.category] : null)}
          {row("ID name", details.idName)}
          {row("ID URL", details.idUrl)}
          {row("ID Country", details.country)}
          {row("Client name", details.clientName)}
          {row("Client country", details.clientCountry)}
          {row("Phone", details.phone)}
          {row("Email", details.email)}
          {row("Website", details.websiteUrl)}
          {row("Delivery date", details.deliveryDate ? new Date(details.deliveryDate).toLocaleDateString() : null)}
          {row("Price", details.price)}
          {row("Duration", details.duration)}
          {row("Status", details.statusNote)}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-2 p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Edit lead details</h2>
      <select name="category" defaultValue={details.category ?? ""} className="input">
        <option value="">— No category —</option>
        {LEAD_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {LEAD_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input name="idName" defaultValue={details.idName ?? ""} placeholder="ID name" className="input" />
        <input name="idUrl" defaultValue={details.idUrl ?? ""} placeholder="ID URL" className="input" />
      </div>
      <input name="country" defaultValue={details.country ?? ""} placeholder="ID Country" className="input" />
      <input name="clientName" required defaultValue={details.clientName} placeholder="Client name" className="input" />
      <input name="clientCountry" defaultValue={details.clientCountry ?? ""} placeholder="Client country" className="input" />
      <div className="grid grid-cols-2 gap-2">
        <input name="phone" defaultValue={details.phone ?? ""} placeholder="Phone" className="input" />
        <input name="email" type="email" defaultValue={details.email ?? ""} placeholder="Email" className="input" />
      </div>
      <input name="websiteUrl" defaultValue={details.websiteUrl ?? ""} placeholder="Website URL" className="input" />
      <div className="grid grid-cols-3 gap-2">
        <input
          name="deliveryDate"
          type="date"
          defaultValue={details.deliveryDate ? details.deliveryDate.slice(0, 10) : ""}
          className="input"
        />
        <input name="price" type="number" step="0.01" defaultValue={details.price ?? ""} placeholder="Price" className="input" />
        <input name="duration" defaultValue={details.duration ?? ""} placeholder="Duration" className="input" />
      </div>
      <input name="statusNote" defaultValue={details.statusNote ?? ""} placeholder="Status" className="input" />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary text-xs">
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
