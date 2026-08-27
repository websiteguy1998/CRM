"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddTemplateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: form.get("channel"),
          name: form.get("name"),
          body: form.get("body"),
        }),
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <select name="channel" className="input" defaultValue="WHATSAPP">
        <option value="WHATSAPP">WhatsApp</option>
        <option value="SMS">SMS</option>
        <option value="EMAIL">Email</option>
      </select>
      <input name="name" required placeholder="Template name" className="input" />
      <input name="body" required placeholder="Message body" className="input sm:col-span-2" />
      <button type="submit" disabled={loading} className="btn-primary sm:col-span-4 sm:w-fit">
        {loading ? "Saving…" : "Add template"}
      </button>
    </form>
  );
}
