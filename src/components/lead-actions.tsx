"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "message" | "call" | "task" | "note";

export default function LeadActions({
  leadId,
  hasPhone,
  hasEmail,
}: {
  leadId: string;
  hasPhone: boolean;
  hasEmail: boolean;
}) {
  const [tab, setTab] = useState<Tab>("message");

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
        {(["message", "call", "task", "note"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 capitalize transition-colors ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "message" && <MessageForm leadId={leadId} hasPhone={hasPhone} hasEmail={hasEmail} />}
      {tab === "call" && <CallForm leadId={leadId} />}
      {tab === "task" && <TaskForm leadId={leadId} />}
      {tab === "note" && <NoteForm leadId={leadId} />}
    </div>
  );
}

function MessageForm({ leadId, hasPhone, hasEmail }: { leadId: string; hasPhone: boolean; hasEmail: boolean }) {
  const router = useRouter();
  const [channel, setChannel] = useState<"WHATSAPP" | "SMS" | "EMAIL">(hasPhone ? "WHATSAPP" : "EMAIL");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/leads/${leadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          body: form.get("body"),
          subject: form.get("subject") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(typeof data.error === "string" ? data.error : "Could not send message");
        return;
      }
      (e.target as HTMLFormElement).reset();
      setNotice(data.simulated ? "Sent (simulated — connect this channel in Settings for real delivery)." : "Sent.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex gap-1 text-xs">
        {(["WHATSAPP", "SMS", "EMAIL"] as const).map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setChannel(c)}
            disabled={c !== "EMAIL" && !hasPhone}
            className={`rounded-full px-2.5 py-1 font-medium disabled:opacity-30 ${
              channel === c ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {c === "WHATSAPP" ? "💬 WhatsApp" : c === "SMS" ? "📱 SMS" : "📧 Email"}
          </button>
        ))}
      </div>
      {channel === "EMAIL" && !hasEmail && (
        <p className="text-xs text-rose-600">This lead has no email on file.</p>
      )}
      {channel === "EMAIL" && <input name="subject" placeholder="Subject" className="input" />}
      <textarea name="body" required rows={3} placeholder="Write a message…" className="input" />
      {notice && <p className="text-xs text-slate-500">{notice}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

function CallForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const minutes = Number(form.get("minutes") || 0);
    const seconds = Number(form.get("seconds") || 0);
    try {
      await fetch(`/api/leads/${leadId}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: form.get("direction"),
          status: form.get("status"),
          durationSec: minutes * 60 + seconds,
          nextAction: form.get("nextAction") || undefined,
          aiSummary: form.get("aiSummary") || undefined,
        }),
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="text-xs text-slate-400">
        Click-to-call via Zoom Phone plugs in here once connected in Settings — log the outcome below
        for now.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select name="direction" className="input" defaultValue="OUTBOUND">
          <option value="OUTBOUND">Outbound</option>
          <option value="INBOUND">Inbound</option>
        </select>
        <select name="status" className="input" defaultValue="ANSWERED">
          <option value="ANSWERED">Answered</option>
          <option value="MISSED">Missed</option>
          <option value="NO_ANSWER">No answer</option>
          <option value="VOICEMAIL">Voicemail</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="minutes" type="number" min={0} placeholder="Minutes" className="input" />
        <input name="seconds" type="number" min={0} max={59} placeholder="Seconds" className="input" />
      </div>
      <input name="nextAction" placeholder="Next action (optional)" className="input" />
      <textarea name="aiSummary" rows={2} placeholder="Call summary / notes (optional)" className="input" />
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Logging…" : "Log call"}
      </button>
    </form>
  );
}

function TaskForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await fetch(`/api/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          type: form.get("type"),
          dueAt: form.get("dueAt"),
          notes: form.get("notes") || undefined,
        }),
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input name="title" required placeholder="e.g. Send proposal" className="input" />
      <div className="grid grid-cols-2 gap-2">
        <select name="type" className="input" defaultValue="CALL">
          <option value="CALL">Call</option>
          <option value="EMAIL">Email</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="SMS">SMS</option>
          <option value="MEETING">Meeting</option>
          <option value="OTHER">Other</option>
        </select>
        <input name="dueAt" type="datetime-local" required className="input" />
      </div>
      <textarea name="notes" rows={2} placeholder="Notes (optional)" className="input" />
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Scheduling…" : "Schedule follow-up"}
      </button>
    </form>
  );
}

function NoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: form.get("body") }),
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea name="body" required rows={4} placeholder="Add an internal note…" className="input" />
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving…" : "Add note"}
      </button>
    </form>
  );
}
