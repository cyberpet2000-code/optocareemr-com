import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setProfile(null); setClinic(null); setLoading(false); return; }
    setLoading(true);
    const { data: p } = await supabase
      .from("profiles")
      .select("id, full_name, role, clinic_id, is_super_admin, title")
      .eq("id", user.id)
      .maybeSingle();
    setProfile(p as any);
    if (p?.clinic_id) {
      const { data: c } = await supabase
        .from("clinics")
        .select("id, name, subscription_status, trial_start_date, trial_end_date, setup_completed, onboarding_step, is_active")
        .eq("id", p.clinic_id)
        .maybeSingle();
      setClinic(c as any);
    } else {
      setClinic(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

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

  return { profile, clinic, loading, trialDaysLeft, trialExpired, canWrite, reload: load };
}
