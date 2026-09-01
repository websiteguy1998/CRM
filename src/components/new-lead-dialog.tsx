"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS } from "@/lib/categories";

export default function NewLeadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateLeadId, setDuplicateLeadId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDuplicateLeadId(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.get("clientName"),
          idName: form.get("idName") || undefined,
          idUrl: form.get("idUrl") || undefined,
          country: form.get("country") || undefined,
          clientCountry: form.get("clientCountry") || undefined,
          websiteUrl: form.get("websiteUrl") || undefined,
          phone: form.get("phone") || undefined,
          email: form.get("email") || undefined,
          deliveryDate: form.get("deliveryDate") || undefined,
          price: form.get("price") || undefined,
          duration: form.get("duration") || undefined,
          statusNote: form.get("statusNote") || undefined,
          category: form.get("category") || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not create lead");
        if (data.duplicateLeadId) setDuplicateLeadId(data.duplicateLeadId);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + New lead
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">New lead</h2>
        <form onSubmit={onSubmit} autoComplete="off" className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
              {duplicateLeadId && (
                <>
                  {" "}
                  <Link href={`/leads/${duplicateLeadId}`} className="underline">
                    View existing lead
                  </Link>
                </>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client name</label>
              <input name="clientName" required className="input" />
            </div>
            <div>
              <label className="label">Client country</label>
              <input name="clientCountry" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ID name</label>
              <input name="idName" className="input" placeholder="Fiverr username, etc." />
            </div>
            <div>
              <label className="label">ID URL</label>
              <input name="idUrl" className="input" placeholder="Profile link" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ID Country</label>
              <input name="country" className="input" />
            </div>
            <div>
              <label className="label">Website URL</label>
              <input name="websiteUrl" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input name="phone" className="input" placeholder="+1 555 123 4567" />
            </div>
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" multiple placeholder="Email(s), comma separated" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Delivery date</label>
              <input name="deliveryDate" type="date" className="input" />
            </div>
            <div>
              <label className="label">Price</label>
              <input name="price" type="number" step="0.01" className="input" />
            </div>
            <div>
              <label className="label">Duration</label>
              <input name="duration" className="input" placeholder="2 weeks" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select name="category" className="input" defaultValue="">
                <option value="">— None —</option>
                {LEAD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {LEAD_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <input name="statusNote" className="input" placeholder="e.g. Text on WhatsApp (Ibrahim)" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creating…" : "Create lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
