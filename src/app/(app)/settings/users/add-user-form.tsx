"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddUserForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          role: form.get("role"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not create user");
        return;
      }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-5">{error}</div>}
      <div>
        <label className="label">Name</label>
        <input name="name" required className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label">Password</label>
        <input name="password" type="password" required minLength={8} className="input" />
      </div>
      <div>
        <label className="label">Role</label>
        <select name="role" className="input" defaultValue="AGENT">
          <option value="AGENT">Agent</option>
          <option value="MANAGER">Manager</option>
          <option value="ADMIN">Admin</option>
          <option value="QA">QA</option>
          <option value="MARKETING">Marketing</option>
        </select>
      </div>
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Adding…" : "Add user"}
      </button>
    </form>
  );
}
