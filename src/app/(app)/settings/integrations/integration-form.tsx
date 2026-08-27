"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CheckEmailButton from "./check-email-button";

type FieldDef = { key: string; label: string; placeholder?: string };

const FIELDS: Record<string, FieldDef[]> = {
  WHATSAPP: [
    { key: "accessToken", label: "Access token" },
    { key: "phoneNumberId", label: "Phone number ID" },
    { key: "verifyToken", label: "Webhook verify token" },
  ],
  ZOOM_PHONE: [
    { key: "accountId", label: "Account ID" },
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client secret" },
  ],
  GMAIL: [
    { key: "email", label: "Gmail address", placeholder: "you@gmail.com" },
    { key: "appPassword", label: "App password", placeholder: "16-character app password" },
  ],
  MICROSOFT_365: [
    { key: "clientId", label: "OAuth client ID" },
    { key: "clientSecret", label: "OAuth client secret" },
    { key: "tenantId", label: "Tenant ID" },
  ],
  SMS_TWILIO: [
    { key: "accountSid", label: "Account SID" },
    { key: "authToken", label: "Auth token" },
    { key: "fromNumber", label: "From number" },
  ],
};

export default function IntegrationForm({
  type,
  title,
  description,
  status,
}: {
  type: keyof typeof FIELDS;
  title: string;
  description: string;
  status: "NOT_CONFIGURED" | "CONNECTED" | "ERROR";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    const form = new FormData(e.currentTarget);
    const config: Record<string, string> = {};
    for (const f of FIELDS[type]) config[f.key] = String(form.get(f.key) ?? "");
    try {
      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name: "default", config }),
      });
      setSaved(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <span
          className={`badge ${status === "CONNECTED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
        >
          {status === "CONNECTED" ? "Connected" : "Not configured"}
        </span>
      </div>
      {type === "GMAIL" && (
        <p className="mb-3 text-xs text-slate-400">
          Needs 2-Step Verification turned on for the Gmail account, then an{" "}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            App Password
          </a>{" "}
          generated there (not your normal Gmail password).
        </p>
      )}
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FIELDS[type].map((f) => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <input
              name={f.key}
              type={f.key === "appPassword" ? "password" : "text"}
              className="input"
              placeholder={f.placeholder}
            />
          </div>
        ))}
        <div className="flex items-end gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </form>
      {type === "GMAIL" && status === "CONNECTED" && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <CheckEmailButton />
        </div>
      )}
    </div>
  );
}
