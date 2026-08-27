"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TaskCheckbox({ taskId, completed }: { taskId: string; completed: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={completed}
      disabled={loading}
      onChange={toggle}
      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
    />
  );
}
