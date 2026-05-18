import React, { useState } from "react";

export type Diagnostic = {
  id: string;
  service: string;
  severity: "ok" | "warning" | "critical";
  message: string;
  timestamp: string;
  details?: string;
};

export default function DiagnosticsTable({ diagnostics, loading }: { diagnostics: Diagnostic[] | null; loading?: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <div className="bg-white border border-slate-100 rounded-lg p-4">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="w-16 h-6 bg-slate-100 rounded animate-pulse" />
              <div className="flex-1 h-6 bg-slate-100 rounded animate-pulse" />
              <div className="w-24 h-6 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!diagnostics || diagnostics.length === 0) {
    return <div className="bg-white border border-slate-100 rounded-lg p-6 text-sm text-slate-500">No diagnostics to show — all systems operational.</div>;
  }

  return (
    <div className="bg-white border border-slate-100 rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs text-slate-500">Severity</th>
            <th className="px-4 py-2 text-left text-xs text-slate-500">Service</th>
            <th className="px-4 py-2 text-left text-xs text-slate-500">Message</th>
            <th className="px-4 py-2 text-left text-xs text-slate-500">Time</th>
            <th className="px-4 py-2 text-right text-xs text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {diagnostics.map((d) => (
            <React.Fragment key={d.id}>
              <tr>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                      d.severity === "critical" ? "bg-rose-100 text-rose-700" : d.severity === "warning" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {d.severity.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-slate-900">{d.service}</div>
                </td>
                <td className="px-4 py-3 align-top text-sm text-slate-700">{d.message}</td>
                <td className="px-4 py-3 align-top text-sm text-slate-500">{new Date(d.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 align-top text-right">
                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [d.id]: !s[d.id] }))}
                    aria-expanded={!!expanded[d.id]}
                    className="text-sm text-slate-600 hover:text-slate-900"
                  >
                    {expanded[d.id] ? "Hide" : "Details"}
                  </button>
                </td>
              </tr>

              {expanded[d.id] && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 bg-slate-50 text-sm text-slate-700">
                    <div className="whitespace-pre-wrap">{d.details ?? "No further details"}</div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
