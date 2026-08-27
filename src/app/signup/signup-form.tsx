"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ROLE_LABELS: Record<string, string> = {
  AGENT: "Sales agent — leads, calls, WhatsApp/SMS/email",
  LEAD_ENTRY: "Lead entry — only adds new leads",
  MANAGER: "Manager",
  QA: "QA — conversations & call recordings",
  MARKETING: "Marketing — campaigns & analytics",
};

export default function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "details" | "done">("email");
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start signup");
        return;
      }
      setDevCode(data.devCode ?? null);
      setStep("details");
    } finally {
      setLoading(false);
    }
  }

  async function submitDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: form.get("code"),
          name: form.get("name"),
          password: form.get("password"),
          role: form.get("role"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create account");
        return;
      }
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-700">
          Account created. A Super Admin needs to approve it before you can sign in — check back
          soon.
        </p>
        <Link href="/login" className="btn-primary inline-flex w-full justify-center">
          Back to login
        </Link>
      </div>
    );
  }

  if (step === "details") {
    return (
      <form onSubmit={submitDetails} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <p className="text-sm text-slate-500">
          We sent a 6-digit code to <span className="font-medium text-slate-700">{email}</span>.
        </p>
        {devCode && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Email isn&apos;t connected yet, so here&apos;s the code directly: <strong>{devCode}</strong>
          </div>
        )}
        <div>
          <label className="label">Verification code</label>
          <input name="code" required maxLength={6} className="input" autoFocus />
        </div>
        <div>
          <label className="label">Your name</label>
          <input name="name" required className="input" />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" required minLength={8} className="input" />
        </div>
        <div>
          <label className="label">I am a…</label>
          <select name="role" required className="input" defaultValue="AGENT">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitEmail} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div>
        <label className="label">Email</label>
        <input
          type="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Sending code…" : "Send verification code"}
      </button>
      <p className="text-center text-xs text-slate-400">
        Already have an account? <Link href="/login" className="text-indigo-600 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
