"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteLeadButton({ leadId, name }: { leadId: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!confirm(`Delete ${name}? This can't be undone — calls stay on the Calls page, but everything else on this lead goes.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(typeof data.error === "string" ? data.error : "Could not delete lead");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={remove} disabled={loading} className="text-xs text-rose-600 hover:underline">
      {loading ? "Deleting…" : "Delete"}
    </button>
  );
}
