import React from "react";

export default function StatusBadge({
  status = "ok",
  label,
}: {
  status?: "ok" | "warning" | "critical" | "degraded";
  label?: string;
}) {
  const map = {
    ok: { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-500", defaultLabel: "OK" },
    warning: { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500", defaultLabel: "Warning" },
    degraded: { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-400", defaultLabel: "Degraded" },
    critical: { bg: "bg-rose-100", text: "text-rose-800", dot: "bg-rose-500", defaultLabel: "Critical" },
  } as const;

  const cfg = map[status];

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${cfg.bg} ${cfg.text} text-sm font-medium`}>
      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shadow-sm`} />
      <span>{label ?? cfg.defaultLabel}</span>
    </span>
  );
}
