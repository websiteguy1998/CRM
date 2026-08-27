"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = { imported: number; duplicates: number; errors: string[] };

export default function ImportForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        return;
      }
      setResult(data);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
      />
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Importing…" : "Import"}
      </button>

      {result && (
        <div className="rounded-lg bg-slate-50 p-4 text-sm">
          <p className="font-medium text-slate-800">
            Imported {result.imported}, skipped {result.duplicates} duplicate(s).
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-rose-600">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
