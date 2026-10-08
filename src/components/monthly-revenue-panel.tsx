"use client";

import { useState } from "react";
import { Link } from "@/components/crm-context";
import { formatCurrency, formatDateTime } from "@/lib/format";

export type MonthlyRevenueRow = {
  month: string;
  label: string;
  totalRevenue: number;
  wonCount: number;
  projects: { leadId: string; clientName: string; price: number; wonAt: string }[];
};

/** The first month with any won projects, defaulting open so the panel isn't empty on load. */
function defaultOpenMonth(months: MonthlyRevenueRow[]) {
  return months.find((m) => m.wonCount > 0)?.month ?? null;
}

export default function MonthlyRevenuePanel({ months }: { months: MonthlyRevenueRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(() => defaultOpenMonth(months));

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Monthly revenue</h2>
      <p className="mb-3 text-xs text-slate-400">
        Projects won from the start to the end of each calendar month.
      </p>
      <div className="divide-y divide-slate-100">
        {months.map((m) => {
          const open = expanded === m.month;
          return (
            <div key={m.month}>
              <button
                onClick={() => setExpanded(open ? null : m.month)}
                className="flex w-full items-center justify-between py-2.5 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <span className={`inline-block text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>
                    ›
                  </span>
                  {m.label}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-slate-500">{m.wonCount} won</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(m.totalRevenue)}</span>
                </span>
              </button>
              {open && (
                <div className="pb-3 pl-5">
                  {m.projects.length === 0 ? (
                    <p className="text-xs text-slate-400">No projects won this month.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {m.projects.map((p) => (
                          <tr key={p.leadId} className="border-b border-slate-50 last:border-0">
                            <td className="py-1.5">
                              <Link
                                href={`/leads/${p.leadId}`}
                                className="font-medium text-slate-700 hover:underline"
                              >
                                {p.clientName || "Unnamed client"}
                              </Link>
                            </td>
                            <td className="py-1.5 text-slate-400">{formatDateTime(p.wonAt)}</td>
                            <td className="py-1.5 text-right font-medium text-slate-800">
                              {formatCurrency(p.price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
