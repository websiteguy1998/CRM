"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OwnerSelector({
  leadId,
  owners,
  currentOwnerId,
  compact,
}: {
  leadId: string;
  owners: { id: string; name: string }[];
  currentOwnerId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onChange(ownerId: string) {
    setLoading(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      className={
        compact
          ? "min-w-[120px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          : "input min-w-[150px]"
      }
      defaultValue={currentOwnerId ?? ""}
      disabled={loading}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Unassigned
      </option>
      {owners.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
