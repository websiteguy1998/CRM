"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SellerDealEditor({
  leadId,
  initialStatusNote,
  initialPrice,
}: {
  leadId: string;
  initialStatusNote: string | null;
  initialPrice: string | null;
}) {
  const router = useRouter();
  const [statusNote, setStatusNote] = useState(initialStatusNote ?? "");
  const [price, setPrice] = useState(initialPrice ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusNote, price: price || undefined }),
      });
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Status & closed value</h2>
      <div>
        <p className="label mb-1">Status</p>
        <textarea
          value={statusNote}
          onChange={(e) => {
            setStatusNote(e.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="What's happening with this lead…"
          className="input"
        />
      </div>
      <div>
        <p className="label mb-1">Closed for ($)</p>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            setSaved(false);
          }}
          placeholder="0.00"
          className="input"
        />
        <p className="mt-1 text-xs text-slate-400">
          Counted toward your total revenue on the Sellers dashboard once this lead's stage is Won.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
        <button type="submit" disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
