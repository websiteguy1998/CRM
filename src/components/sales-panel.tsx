"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDateTime } from "@/lib/format";

type Sale = {
  id: string;
  type: "INITIAL" | "UPSELL";
  description: string | null;
  amount: string;
  closedAt: string;
};

export default function SalesPanel({ leadId, sales, isWon }: { leadId: string; sales: Sale[]; isWon: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = sales.reduce((sum, s) => sum + Number(s.amount), 0);

  async function addUpsell(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not add the upsell");
        return;
      }
      setDescription("");
      setAmount("");
      setAdding(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!isWon) return null;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Sales</h2>
        <span className="text-sm font-semibold text-emerald-700">{formatCurrency(total)}</span>
      </div>

      {sales.length > 0 && (
        <ul className="mb-3 space-y-2 text-sm">
          {sales.map((s) => (
            <SaleRow key={s.id} leadId={leadId} sale={s} onSaved={() => router.refresh()} />
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={addUpsell} className="space-y-2 rounded-lg bg-indigo-50 p-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="What was upsold? e.g. SEO package"
            className="input text-sm"
          />
          <input
            type="number"
            step="0.01"
            min={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="Amount"
            className="input text-sm"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-xs">
              {saving ? "Saving…" : "Add upsell"}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-secondary w-full text-xs">
          + Add an upsell
        </button>
      )}
    </div>
  );
}

function SaleRow({ leadId, sale, onSaved }: { leadId: string; sale: Sale; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(sale.description ?? "");
  const [amount, setAmount] = useState(sale.amount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/sales/${sale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sale.type === "UPSELL" ? { description, amount } : { amount }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not save");
        return;
      }
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="border-b border-slate-50 pb-2 last:border-0">
        <form onSubmit={save} className="space-y-2 rounded-lg bg-indigo-50 p-2">
          {sale.type === "UPSELL" && (
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="What was upsold?"
              className="input text-sm"
            />
          )}
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-slate-400">$</span>
            <input
              type="number"
              step="0.01"
              min={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="input text-sm"
            />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDescription(sale.description ?? "");
                setAmount(sale.amount);
                setError(null);
              }}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-xs">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 border-b border-slate-50 pb-2 last:border-0">
      <div>
        <p className="text-slate-800">{sale.type === "INITIAL" ? "Initial win" : `Upsell — ${sale.description}`}</p>
        <p className="text-xs text-slate-400">{formatDateTime(sale.closedAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-medium text-slate-800">{formatCurrency(Number(sale.amount))}</span>
        <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-indigo-600 hover:underline">
          Edit
        </button>
      </div>
    </li>
  );
}
