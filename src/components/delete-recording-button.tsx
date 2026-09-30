"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteRecordingButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!confirm("Delete this call recording? This can't be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/calls/${callId}/recording`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(typeof data.error === "string" ? data.error : "Could not delete the recording");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={remove} disabled={loading} className="text-xs text-rose-600 hover:underline disabled:opacity-50">
      {loading ? "Deleting…" : "Delete"}
    </button>
  );
}
