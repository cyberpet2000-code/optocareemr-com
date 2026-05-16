import { useAccessActions, useAccessClinic } from "./useAccess";

export interface ClinicInfo {
  id: string;
  name: string;
  subscription_status: string | null;
  setup_completed: boolean | null;
  onboarding_step: string | null;
  is_active: boolean | null;
  lifecycle_status?: string | null;
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

export type ClinicLifecycleStatus = "active" | "suspended" | "unknown";

export function useClinic() {
  const { profile, clinic, profileLoading, clinicLoading, activeClinicId, effectiveClinicId } = useAccessClinic();
  const { reload, switchClinic } = useAccessActions();
  const loading = profileLoading || clinicLoading;

  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === "super_admin";
  const isSuspended = !!clinic && (clinic.lifecycle_status === "suspended" || clinic.is_active === false);

  const lifecycleStatus: ClinicLifecycleStatus = !clinic ? "unknown" : (isSuspended ? "suspended" : "active");
  const subscriptionRequired = isSuspended && !isSuperAdmin;
  const canWrite = !subscriptionRequired;

  return {
    profile: profile as ProfileInfo | null,
    clinic: clinic as ClinicInfo | null,
    loading,
    isSuspended,
    subscriptionRequired,
    lifecycleStatus,
    canWrite,
    reload,
    switchClinic,
    activeClinicId,
    effectiveClinicId,
  };
}
