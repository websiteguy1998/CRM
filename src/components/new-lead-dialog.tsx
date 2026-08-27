"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewLeadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName") || undefined,
          email: form.get("email") || undefined,
          phone: form.get("phone") || undefined,
          companyName: form.get("companyName") || undefined,
          sourceName: form.get("sourceName") || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not create lead");
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">New lead</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input name="firstName" required className="input" />
            </div>
            <div>
              <label className="label">Last name</label>
              <input name="lastName" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" className="input" placeholder="+1 555 123 4567" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Company</label>
              <input name="companyName" className="input" />
            </div>
            <div>
              <label className="label">Lead source</label>
              <input name="sourceName" className="input" placeholder="Google Ads" />
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
