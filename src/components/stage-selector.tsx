"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StageSelector({
  leadId,
  stages,
  currentStageId,
  currentPrice,
  compact,
}: {
  leadId: string;
  stages: { id: string; name: string; isWon?: boolean }[];
  currentStageId: string;
  currentPrice?: number | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentStageId);
  const [loading, setLoading] = useState(false);
  // A stage the seller just picked that's a Won stage — held here instead of
  // committed right away, so we can ask "how much did you close this for?"
  // in the same action instead of making them hunt for a price field
  // afterward. Nothing is saved until they confirm or skip.
  const [winStage, setWinStage] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [hasUpsell, setHasUpsell] = useState(false);
  const [upsellDescription, setUpsellDescription] = useState("");
  const [upsellAmount, setUpsellAmount] = useState("");

  async function commit(
    stageId: string,
    price?: number,
    upsell?: { description: string; amount: number }
  ) {
    setLoading(true);
    try {
      await fetch(`/api/leads/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId,
          ...(price !== undefined ? { price } : {}),
          ...(upsell ? { upsellDescription: upsell.description, upsellAmount: upsell.amount } : {}),
        }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function onChange(stageId: string) {
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.isWon) {
      setAmount(currentPrice != null ? String(currentPrice) : "");
      setHasUpsell(false);
      setUpsellDescription("");
      setUpsellAmount("");
      setWinStage(stage);
      return;
    }
    setValue(stageId);
    commit(stageId);
  }

  function confirmWin(e: React.FormEvent) {
    e.preventDefault();
    if (!winStage) return;
    setValue(winStage.id);
    commit(
      winStage.id,
      Number(amount),
      hasUpsell && upsellDescription.trim() && upsellAmount
        ? { description: upsellDescription.trim(), amount: Number(upsellAmount) }
        : undefined
    );
    setWinStage(null);
  }

  function skipAmount() {
    if (!winStage) return;
    setValue(winStage.id);
    commit(winStage.id);
    setWinStage(null);
  }

  return (
    <>
      <select
        className={
          compact
            ? "w-full max-w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            : "input"
        }
        value={value}
        disabled={loading}
        onChange={(e) => onChange(e.target.value)}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {winStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={confirmWin}
            className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl"
          >
            <p className="text-3xl">🎉</p>
            <h2 className="mt-2 text-base font-semibold text-slate-900">
              Nice! Marking this as {winStage.name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">How much did you close it for?</p>
            <div className="mt-4 flex items-center justify-center gap-1">
              <span className="text-2xl font-semibold text-slate-400">$</span>
              <input
                autoFocus
                type="number"
                step="0.01"
                min={0}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input w-40 text-center text-2xl font-semibold"
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              This is added straight to your total won sales.
            </p>

            {hasUpsell ? (
              <div className="mt-4 space-y-2 rounded-lg bg-indigo-50 p-3 text-left">
                <p className="text-xs font-medium text-indigo-700">Upsell on this deal</p>
                <input
                  value={upsellDescription}
                  onChange={(e) => setUpsellDescription(e.target.value)}
                  placeholder="What was upsold? e.g. SEO package"
                  className="input text-sm"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-slate-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={upsellAmount}
                    onChange={(e) => setUpsellAmount(e.target.value)}
                    placeholder="0.00"
                    className="input text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setHasUpsell(false)}
                  className="text-xs text-slate-400 hover:underline"
                >
                  Remove upsell
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHasUpsell(true)}
                className="mt-3 text-xs font-medium text-indigo-600 hover:underline"
              >
                + Also closed an upsell on this?
              </button>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Saving…" : "Save & mark won"}
              </button>
              <div className="flex justify-center gap-4 text-xs">
                <button
                  type="button"
                  onClick={() => setWinStage(null)}
                  className="text-slate-400 hover:underline"
                >
                  Cancel
                </button>
                <button type="button" onClick={skipAmount} className="text-slate-400 hover:underline">
                  Skip for now
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
