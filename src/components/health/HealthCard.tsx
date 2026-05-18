import React from "react";
import StatusBadge from "./StatusBadge";

type HealthCardProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  status?: "ok" | "warning" | "critical" | "degraded";
  loading?: boolean;
};

export default function HealthCard({ title, subtitle, children, status, loading }: HealthCardProps) {
  return (
    <div className="bg-white border border-slate-100 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        <div>{status ? <StatusBadge status={status} /> : <div className="text-sm text-slate-400">—</div>}</div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
            <div className="h-4 bg-slate-100 rounded w-1/3 animate-pulse" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
