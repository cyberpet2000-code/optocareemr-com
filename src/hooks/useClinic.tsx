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
}

export interface ProfileInfo {
  id: string;
  full_name: string | null;
  role: string | null;
  clinic_id: string | null;
  is_super_admin: boolean | null;
  title: string | null;
}

export function useClinic() {
  const { profile, clinic, profileLoading, clinicLoading, reload } = useAccess();
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

  const canWrite = !trialExpired || profile?.is_super_admin === true || profile?.role === "super_admin";

  return { profile: profile as ProfileInfo | null, clinic: clinic as ClinicInfo | null, loading, trialDaysLeft, trialExpired, canWrite, reload };
}
