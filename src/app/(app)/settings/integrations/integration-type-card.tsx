"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CheckEmailButton from "./check-email-button";

type FieldDef = { key: string; label: string; placeholder?: string; secret?: boolean };

const FIELDS: Record<string, FieldDef[]> = {
  WHATSAPP: [
    { key: "accessToken", label: "Access token", secret: true },
    { key: "phoneNumberId", label: "Phone number ID" },
    { key: "verifyToken", label: "Webhook verify token" },
  ],
  ZOOM_PHONE: [
    { key: "accountId", label: "Account ID" },
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client secret", secret: true },
    { key: "webhookSecretToken", label: "Webhook secret token", secret: true },
  ],
  GMAIL: [
    { key: "email", label: "Gmail address", placeholder: "you@gmail.com" },
    { key: "appPassword", label: "App password", secret: true, placeholder: "16-character app password" },
  ],
  MICROSOFT_365: [
    { key: "clientId", label: "OAuth client ID" },
    { key: "clientSecret", label: "OAuth client secret", secret: true },
    { key: "tenantId", label: "Tenant ID" },
  ],
  SMS_TWILIO: [
    { key: "accountSid", label: "Account SID" },
    { key: "authToken", label: "Auth token", secret: true },
    { key: "fromNumber", label: "From number" },
  ],
};

type Account = {
  id: string;
  name: string;
  status: "NOT_CONFIGURED" | "CONNECTED" | "ERROR";
  lastError?: string;
};

export default function IntegrationTypeCard({
  type,
  title,
  description,
  accounts,
}: {
  type: keyof typeof FIELDS;
  title: string;
  description: string;
  accounts: Account[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(accounts.length === 0);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const label = String(form.get("__label") ?? "").trim();
    const config: Record<string, string> = {};
    for (const f of FIELDS[type]) config[f.key] = String(form.get(f.key) ?? "");
    try {
      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name: label, config }),
      });
      setAdding(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this account?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/integrations/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary text-xs">
            + Add another
          </button>
        )}
      </div>

      {accounts.length > 0 && (
        <ul className="mb-3 space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{a.name}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`badge ${
                      a.status === "CONNECTED" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {a.status === "CONNECTED" ? "Connected" : "Error"}
                  </span>
                  <button
                    onClick={() => remove(a.id)}
                    disabled={deletingId === a.id}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {a.status === "ERROR" && a.lastError && (
                <p className="mt-1 text-xs text-rose-600">
                  Last attempt failed: {a.lastError} — fix the credentials below and re-add it with the
                  same label to reconnect.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {type === "GMAIL" && accounts.some((a) => a.status === "CONNECTED") && (
        <div className="mb-3 border-t border-slate-100 pt-3">
          <CheckEmailButton />
        </div>
      )}

      {adding && (
        <>
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
              generated there (not the normal Gmail password).
            </p>
          )}
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3" autoComplete="off">
            <div>
              <label className="label">Label</label>
              <input
                name="__label"
                required
                className="input"
                autoComplete="off"
                placeholder={
                  type === "WHATSAPP" ? "e.g. Sales number" : type === "GMAIL" ? "e.g. Support inbox" : "Name this account"
                }
              />
            </div>
            {FIELDS[type].map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input
                  name={f.key}
                  type={f.secret ? "password" : "text"}
                  className="input"
                  autoComplete={f.secret ? "new-password" : "off"}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
            <div className="flex items-end gap-2">
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? "Saving…" : "Save"}
              </button>
              {accounts.length > 0 && (
                <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
