"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ZoomBackfillButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function importCalls() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/zoom/backfill-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 90 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Could not import call history");
        return;
      }
      setMessage(
        `Found ${data.total} call(s) from the last 90 days — added ${data.recorded} new, updated ${data.updated} with newer info.`
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={importCalls} disabled={loading} className="btn-secondary text-xs">
        {loading ? "Importing…" : "Import past 90 days of calls"}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
