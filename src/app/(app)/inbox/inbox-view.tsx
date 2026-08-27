"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { channelIcon, formatDateTime, relativeTime } from "@/lib/format";

type ConversationSummary = {
  id: string;
  channel: "WHATSAPP" | "SMS" | "EMAIL";
  lastMessageAt: string;
  lead: {
    id: string;
    contact: { firstName: string; lastName: string | null; phone: string | null; email: string | null };
    owner: { name: string } | null;
  };
  messages: { direction: "INBOUND" | "OUTBOUND"; body: string | null }[];
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string | null;
  createdAt: string;
  sentBy: { name: string } | null;
};

type ConversationDetail = {
  id: string;
  channel: "WHATSAPP" | "SMS" | "EMAIL";
  subject: string | null;
  lead: {
    id: string;
    contact: { firstName: string; lastName: string | null; phone: string | null; email: string | null };
  };
  messages: Message[];
};

export default function InboxView({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const [conversations] = useState(initialConversations);
  const [filter, setFilter] = useState<"ALL" | "WHATSAPP" | "SMS" | "EMAIL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");

  const filtered = conversations.filter((c) => filter === "ALL" || c.channel === filter);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(`/api/conversations/${selectedId}`)
      .then((r) => r.json())
      .then((data) => setDetail(data.conversation))
      .catch(() => setDetail(null));
  }, [selectedId]);

  async function send() {
    if (!detail || !draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/leads/${detail.lead.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: detail.channel, body: draft }),
      });
      if (res.ok) {
        setDraft("");
        const refreshed = await fetch(`/api/conversations/${detail.id}`).then((r) => r.json());
        setDetail(refreshed.conversation);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-73px)]">
      <div className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex gap-1 border-b border-slate-100 p-2 text-xs">
          {(["ALL", "WHATSAPP", "SMS", "EMAIL"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-md px-2 py-1 font-medium ${
                filter === c ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {c === "ALL" ? "All" : `${channelIcon(c)} ${c}`}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full flex-col items-start border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                selectedId === c.id ? "bg-indigo-50" : ""
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium text-slate-800">
                  {channelIcon(c.channel)} {c.lead.contact.firstName} {c.lead.contact.lastName}
                </span>
                <span className="text-xs text-slate-400">{relativeTime(c.lastMessageAt)}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                {c.messages[0]?.direction === "OUTBOUND" ? "You: " : ""}
                {c.messages[0]?.body ?? "No messages yet"}
              </p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-slate-400">No conversations yet.</p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {detail ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
              <div>
                <Link href={`/leads/${detail.lead.id}`} className="font-medium text-slate-900 hover:underline">
                  {detail.lead.contact.firstName} {detail.lead.contact.lastName}
                </Link>
                <p className="text-xs text-slate-400">
                  {channelIcon(detail.channel)} {detail.channel}
                  {detail.lead.contact.phone ? ` · ${detail.lead.contact.phone}` : ""}
                  {detail.lead.contact.email ? ` · ${detail.lead.contact.email}` : ""}
                </p>
              </div>
              <Link href={`/leads/${detail.lead.id}`} className="btn-secondary text-xs">
                View lead
              </Link>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-6">
              {detail.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                      m.direction === "OUTBOUND"
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    <p>{m.body}</p>
                    <p className={`mt-1 text-[10px] ${m.direction === "OUTBOUND" ? "text-indigo-200" : "text-slate-400"}`}>
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {detail.messages.length === 0 && (
                <p className="text-center text-sm text-slate-400">No messages in this conversation yet.</p>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={`Reply via ${detail.channel.toLowerCase()}…`}
                className="input"
              />
              <button onClick={send} disabled={sending} className="btn-primary">
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
