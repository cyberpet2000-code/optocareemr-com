import { useAccess } from "./useAccess";

export interface ClinicInfo {
  id: string;
  name: string;
  subscription_status: string | null;
  trial_start_date: string | null;
  trial_end_date: string | null;
  setup_completed: boolean | null;
  onboarding_step: string | null;
  is_active: boolean | null;
  deactivated_at?: string | null;
  deactivation_reason?: string | null;
}

export interface ProfileInfo {
  id: string;
  full_name: string | null;
  role: string | null;
  clinic_id: string | null;
  is_super_admin: boolean | null;
  title: string | null;
}

export type ClinicLifecycleStatus =
  | "trial_active"
  | "trial_expiring_soon"
  | "subscription_active"
  | "expired"
  | "suspended"
  | "unknown";

export function useClinic() {
  const { profile, clinic, profileLoading, clinicLoading, reload, switchClinic, activeClinicId, effectiveClinicId } = useAccess();
  const loading = profileLoading || clinicLoading;

  const trialDaysLeft = (() => {
    if (!clinic) return 0;
    if (clinic.subscription_status === "active") return Infinity;
    const end = clinic.trial_end_date ? new Date(clinic.trial_end_date) : null;
    if (!end) return 0;
    return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  })();

  const trialExpired = clinic
    ? clinic.subscription_status !== "active" && trialDaysLeft <= 0
    : false;

  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === "super_admin";

  const isDeactivated = !!clinic && clinic.is_active === false;
  const subscriptionRequired = isDeactivated && !isSuperAdmin;

  const canWrite = (!trialExpired && !isDeactivated) || isSuperAdmin;

  const lifecycleStatus: ClinicLifecycleStatus = (() => {
    if (!clinic) return "unknown";
    if (isDeactivated) {
      if (clinic.deactivation_reason === "trial_expired" || clinic.subscription_status === "expired") return "expired";
      return "suspended";
    }
    if (clinic.subscription_status === "active") return "subscription_active";
    if (trialDaysLeft !== Infinity && trialDaysLeft <= 3) return "trial_expiring_soon";
    return "trial_active";
  })();

  return {
    profile: profile as ProfileInfo | null,
    clinic: clinic as ClinicInfo | null,
    loading,
    trialDaysLeft,
    trialExpired,
    isDeactivated,
    subscriptionRequired,
    lifecycleStatus,
    canWrite,
    reload,
    switchClinic,
    activeClinicId,
    effectiveClinicId,
  };
}
