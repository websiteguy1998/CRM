"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/components/crm-context";
import DeleteRecordingButton from "@/components/delete-recording-button";
import { formatDateTime } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  ANSWERED: "bg-emerald-100 text-emerald-700",
  MISSED: "bg-rose-100 text-rose-700",
  NO_ANSWER: "bg-amber-100 text-amber-700",
  VOICEMAIL: "bg-slate-100 text-slate-600",
};

export type CallRow = {
  id: string;
  leadId: string | null;
  leadName: string | null;
  agentName: string | null;
  direction: "INBOUND" | "OUTBOUND";
  status: "ANSWERED" | "MISSED" | "NO_ANSWER" | "VOICEMAIL";
  durationSec: number;
  recordingUrl: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  nextAction: string | null;
  startedAt: string;
};

export default function CallsTable({ calls, admin }: { calls: CallRow[]; admin: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const withRecording = calls.filter((c) => c.recordingUrl);
  const allSelected = withRecording.length > 0 && selected.size === withRecording.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(withRecording.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} call recording(s)? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await fetch("/api/calls/bulk-delete-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callIds: Array.from(selected) }),
      });
      setSelected(new Set());
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {admin && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
          <span className="text-xs font-medium text-rose-800">{selected.size} recording(s) selected</span>
          <button
            onClick={bulkDelete}
            disabled={deleting}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete selected"}
          </button>
          <button onClick={() => setSelected(new Set())} className="btn-ghost text-xs">
            Clear selection
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
              {admin && (
                <th className="w-8 px-4 py-2 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    disabled={withRecording.length === 0}
                    aria-label="Select all recordings"
                  />
                </th>
              )}
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-4 py-2 font-medium">Agent</th>
              <th className="px-4 py-2 font-medium">Direction</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Recording</th>
              <th className="px-4 py-2 font-medium">Next action</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => {
              const minutes = Math.floor(call.durationSec / 60);
              const seconds = call.durationSec % 60;
              return (
                <tr key={call.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  {admin && (
                    <td className="px-4 py-2.5">
                      {call.recordingUrl && (
                        <input
                          type="checkbox"
                          checked={selected.has(call.id)}
                          onChange={() => toggleOne(call.id)}
                          aria-label={`Select recording for ${call.leadName ?? call.id}`}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    {call.leadId ? (
                      <Link href={`/leads/${call.leadId}`} className="font-medium text-slate-800 hover:underline">
                        {call.leadName}
                      </Link>
                    ) : (
                      <span className="text-slate-400">
                        {(call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber) ?? "Unknown number"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{call.agentName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{call.direction}</td>
                  <td className="px-4 py-2.5">
                    <span className={`badge ${STATUS_COLOR[call.status]}`}>{call.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {call.status === "ANSWERED" ? `${minutes}:${seconds.toString().padStart(2, "0")}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {call.recordingUrl ? (
                      <div className="flex items-center gap-2">
                        <audio controls preload="none" src={call.recordingUrl} className="h-8 w-40" />
                        {admin && <DeleteRecordingButton callId={call.id} />}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{call.nextAction ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-400">{formatDateTime(call.startedAt)}</td>
                </tr>
              );
            })}
            {calls.length === 0 && (
              <tr>
                <td colSpan={admin ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                  No calls logged yet. Log one from a lead&apos;s profile.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
