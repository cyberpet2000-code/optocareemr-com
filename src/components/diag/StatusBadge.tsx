import React from "react";
import clsx from "clsx";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

export type StatusVariant = "info" | "warn" | "error" | "healthy" | "critical";

export default function StatusBadge({
  variant = "info",
  children,
  className,
}: {
  variant?: StatusVariant;
  children?: React.ReactNode;
  className?: string;
}) {
  const base = "inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-medium";
  const variants: Record<StatusVariant, string> = {
    info: "bg-slate-700/10 text-slate-900 dark:bg-slate-700/20 dark:text-slate-100",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
    error: "bg-rose-100 text-rose-800 dark:bg-rose-900/20 dark:text-rose-300",
    healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/15 dark:text-emerald-300",
    critical: "bg-red-100 text-red-800 dark:bg-red-900/15 dark:text-red-300",
  };

  const Icon = variant === "healthy" ? CheckCircle2 : variant === "warn" ? AlertTriangle : variant === "error" || variant === "critical" ? XCircle : Info;

  return (
    <span className={clsx(base, variants[variant], className)}>
      <Icon size={14} />
      <span className="truncate">{children}</span>
    </span>
  );
}
