"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLE_OPTIONS = ["ADMIN", "MANAGER", "AGENT", "QA", "MARKETING", "LEAD_ENTRY"];

export default function ApprovalActions({
  userId,
  requestedRole,
}: {
  userId: string;
  requestedRole: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState(requestedRole);
  const [loading, setLoading] = useState(false);

  async function approve() {
    setLoading(true);
    try {
      await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true, role }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function reject() {
    if (!confirm("Reject and delete this account request?")) return;
    setLoading(true);
    try {
      await fetch(`/api/users/${userId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select value={role} onChange={(e) => setRole(e.target.value)} className="input py-1 text-xs" disabled={loading}>
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button onClick={approve} disabled={loading} className="btn-primary py-1 text-xs">
        Approve
      </button>
      <button onClick={reject} disabled={loading} className="btn-secondary py-1 text-xs text-rose-600">
        Reject
      </button>
    </div>
  );
}
