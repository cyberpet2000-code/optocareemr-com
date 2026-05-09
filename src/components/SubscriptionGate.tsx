import { Link, useLocation } from "react-router-dom";
import { Lock, CreditCard } from "lucide-react";
import { useClinic } from "@/hooks/useClinic";

/**
 * Blocks access to the entire clinic workspace when the clinic has been
 * deactivated (trial expired, subscription unpaid, or manually suspended).
 *
 * Super admins bypass this gate entirely. Clinic admins can still reach
 * the billing page so they can pay/upgrade.
 */
export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { clinic, subscriptionRequired, lifecycleStatus } = useClinic();
  const location = useLocation();

  if (!subscriptionRequired) return <>{children}</>;

  // Always allow billing + super-admin paths through (clinic admin can pay)
  if (location.pathname.startsWith("/billing") || location.pathname.startsWith("/super-admin")) {
    return <>{children}</>;
  }

  const reason = clinic?.deactivation_reason || lifecycleStatus;
  const isExpired = reason === "trial_expired" || lifecycleStatus === "expired";

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <Lock size={22} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {isExpired ? "Trial expired" : "Subscription required"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {clinic?.name ? `${clinic.name} ` : "This clinic "}
            has been deactivated. Activate a subscription to restore full access for your team.
          </p>
        </div>
        <Link
          to="/billing"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
        >
          <CreditCard size={16} /> Go to Billing
        </Link>
        <p className="text-[11px] text-muted-foreground">
          Need help? Contact your platform administrator.
        </p>
      </div>
    </div>
  );
}
