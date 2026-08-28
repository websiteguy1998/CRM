"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OwnerSelector({
  leadId,
  owners,
  currentOwnerId,
}: {
  leadId: string;
  owners: { id: string; name: string }[];
  currentOwnerId: string | null;
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
      className="input min-w-[150px]"
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
