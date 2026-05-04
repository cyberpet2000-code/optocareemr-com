import { ReactNode } from "react";
import { useClinic } from "@/hooks/useClinic";
import { Lock } from "lucide-react";
import { Link } from "react-router-dom";

/** Wrap any write action button/section. Disables children + shows upgrade hint when trial expired. */
export function TrialGuard({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { canWrite, trialExpired } = useClinic();
  if (canWrite) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
      <Lock className="text-destructive shrink-0" size={20} />
      <div className="flex-1 text-sm">
        <div className="font-semibold text-destructive">Trial expired</div>
        <div className="text-muted-foreground">Upgrade your plan to continue creating or editing records.</div>
      </div>
      <Link to="/billing" className="text-sm font-medium px-3 py-2 rounded-xl bg-primary text-primary-foreground">Upgrade</Link>
    </div>
  );
}

/** For inline buttons: returns disabled + onClick guard helpers. */
export function useWriteGuard() {
  const { canWrite, trialExpired } = useClinic();
  return {
    canWrite,
    trialExpired,
    disabledProps: canWrite ? {} : { disabled: true, title: "Trial expired — upgrade to continue" },
  };
}
