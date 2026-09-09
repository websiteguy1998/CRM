"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatusNoteEditor({
  leadId,
  initialValue,
}: {
  leadId: string;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === (initialValue ?? "")) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusNote: value }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="Add status…"
      disabled={saving}
      className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-slate-600 hover:border-slate-200 hover:bg-white focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
    />
  );
}
