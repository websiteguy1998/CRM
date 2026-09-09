"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StageSelector({
  leadId,
  stages,
  currentStageId,
  compact,
}: {
  leadId: string;
  stages: { id: string; name: string }[];
  currentStageId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onChange(stageId: string) {
    setLoading(true);
    try {
      await fetch(`/api/leads/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
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
          ? "w-full max-w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          : "input"
      }
      defaultValue={currentStageId}
      disabled={loading}
      onChange={(e) => onChange(e.target.value)}
    >
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
