"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CheckEmailButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function check() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/email/check", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Could not check inbox");
        return;
      }
      setMessage(
        data.checked > 0
          ? `Found ${data.checked} new email(s) — added to leads' timelines.`
          : "No new emails."
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={check} disabled={loading} className="btn-secondary text-xs">
        {loading ? "Checking…" : "Check for new emails now"}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
