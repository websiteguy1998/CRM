"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ScoreBadge from "@/components/score-badge";
import { formatCurrency } from "@/lib/format";

type BoardLead = {
  id: string;
  name: string;
  company: string | null;
  score: number;
  ownerName: string | null;
  dealValue: number | null;
};

type Stage = {
  id: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
  leads: BoardLead[];
};

export default function PipelineBoard({ initialStages }: { initialStages: Stage[] }) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);

  async function moveLead(leadId: string, toStageId: string) {
    let fromStageId: string | null = null;
    let lead: BoardLead | undefined;

    setStages((prev) =>
      prev.map((s) => {
        const found = s.leads.find((l) => l.id === leadId);
        if (found) {
          fromStageId = s.id;
          lead = found;
        }
        return s;
      })
    );

    if (!lead || fromStageId === toStageId) return;

    setStages((prev) =>
      prev.map((s) => {
        if (s.id === fromStageId) return { ...s, leads: s.leads.filter((l) => l.id !== leadId) };
        if (s.id === toStageId) return { ...s, leads: [lead as BoardLead, ...s.leads] };
        return s;
      })
    );

    await fetch(`/api/leads/${leadId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId: toStageId }),
    });
    router.refresh();
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => (
        <div
          key={stage.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragLeadId) moveLead(dragLeadId, stage.id);
            setDragLeadId(null);
          }}
          className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/70 p-3"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-slate-700">{stage.name}</h3>
            <span className="text-xs text-slate-400">{stage.leads.length}</span>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            {stage.leads.map((lead) => (
              <div
                key={lead.id}
                draggable
                onDragStart={() => setDragLeadId(lead.id)}
                className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
              >
                <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                  {lead.name}
                </Link>
                {lead.company && <p className="text-xs text-slate-400">{lead.company}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <ScoreBadge score={lead.score} />
                  {lead.dealValue ? (
                    <span className="text-xs font-medium text-slate-500">
                      {formatCurrency(lead.dealValue)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-400">{lead.ownerName ?? "Unassigned"}</p>
              </div>
            ))}
            {stage.leads.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                Drop leads here
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
