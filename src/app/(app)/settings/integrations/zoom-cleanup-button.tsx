"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ZoomCleanupButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function cleanup() {
    if (!confirm("Remove leads that Zoom call sync auto-created before this fix? Manually-entered leads and any lead you've edited are left untouched — the calls themselves stay on the Calls page.")) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/leads/cleanup-zoom-auto-created", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Could not clean up");
        return;
      }
      setMessage(
        data.removed > 0
          ? `Removed ${data.removed} auto-created lead(s) — ${data.callsPreserved} call(s) kept on the Calls page.`
          : "No auto-created leads found to remove."
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={cleanup} disabled={loading} className="btn-secondary text-xs">
        {loading ? "Cleaning up…" : "Remove leads Zoom auto-created before this fix"}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
