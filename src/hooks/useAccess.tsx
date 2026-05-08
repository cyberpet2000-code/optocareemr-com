import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const VALID_ROLES = ["super_admin", "admin", "doctor", "nurse", "receptionist"];
const ACTIVE_CLINIC_KEY = "active_clinic_id";

function normalizeRole(value?: string | null) {
  return value && VALID_ROLES.includes(value) ? value : null;
}

function resolvePrimaryRole(profile: any, userRoles: string[]) {
  if (profile?.is_super_admin || profile?.role === "super_admin") return "super_admin";
  const profileRole = normalizeRole(profile?.role);
  if (profileRole) return profileRole;
  return userRoles.find((r) => normalizeRole(r)) || null;
}

function hexToHsl(hex?: string | null): string | null {
  if (!hex) return null;
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyClinicTheme(clinic: any | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const primary = hexToHsl(clinic?.theme_color);
  if (primary) {
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
  }
}

const AccessContext = createContext<any>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [clinic, setClinic] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [clinicLoading, setClinicLoading] = useState(false);
  const [profileError, setProfileError] = useState<any>(null);
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_CLINIC_KEY); } catch { return null; }
  });
  const [memberships, setMemberships] = useState<Array<{ clinic_id: string; role: string; clinic_name: string | null; setup_completed: boolean | null }>>([]);
  const requestRef = useRef(0);

  const persistActive = (id: string | null) => {
    try {
      if (id) localStorage.setItem(ACTIVE_CLINIC_KEY, id);
      else localStorage.removeItem(ACTIVE_CLINIC_KEY);
    } catch {}
  };

  const loadAccess = useCallback(async (nextUser = user, overrideClinicId: string | null = activeClinicId) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (!nextUser) {
      setProfile(null); setClinic(null); setRoles([]); setRole(null);
      setProfileLoading(false); setRoleLoading(false); setClinicLoading(false);
      applyClinicTheme(null);
      return;
    }

    setProfileLoading(true); setRoleLoading(true); setClinicLoading(true);
    setProfileError(null);

    const profileResult = await supabase.from("profiles").select("*").eq("id", nextUser.id).maybeSingle();
    const userRolesResult = await supabase.from("user_roles").select("role").eq("user_id", nextUser.id);
    if (requestRef.current !== requestId) return;

    const nextProfile = profileResult.data || null;
    const fallbackRoles = (userRolesResult.data || []).map((r: any) => normalizeRole(r.role)).filter(Boolean);
    const primaryRole = resolvePrimaryRole(nextProfile, fallbackRoles);
    const nextRoles = Array.from(new Set([primaryRole, ...fallbackRoles].filter(Boolean))) as string[];

    setProfile(nextProfile);
    setProfileError(profileResult.error || null);
    setRoles(nextRoles);
    setRole(primaryRole);
    setProfileLoading(false);
    setRoleLoading(false);

    // Effective clinic: super_admin uses active override; others use profile.clinic_id
    const isSuper = primaryRole === "super_admin";
    const effectiveClinicId = isSuper
      ? (overrideClinicId || nextProfile?.clinic_id || null)
      : (nextProfile?.clinic_id || null);

    if (!effectiveClinicId) {
      setClinic(null); setClinicLoading(false); applyClinicTheme(null); return;
    }

    const clinicResult = await supabase
      .from("clinics")
      .select("id, name, subscription_status, trial_start_date, trial_end_date, setup_completed, onboarding_step, is_active, theme_color, secondary_color, logo_url")
      .eq("id", effectiveClinicId)
      .maybeSingle();
    if (requestRef.current !== requestId) return;

    setClinic(clinicResult.data || null);
    setClinicLoading(false);
    applyClinicTheme(clinicResult.data || null);
  }, [user, activeClinicId]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (!session?.user) {
        persistActive(null);
        setActiveClinicIdState(null);
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadAccess(user, activeClinicId);
  }, [authLoading, user, activeClinicId, loadAccess]);

  const switchClinic = useCallback(async (clinicId: string | null) => {
    const fromClinic = activeClinicId;
    persistActive(clinicId);
    setActiveClinicIdState(clinicId);
    let granted = true;
    let reason: string | null = null;
    try {
      await loadAccess(user, clinicId);
    } catch (e: any) {
      granted = false;
      reason = e?.message || "load failed";
      throw e;
    } finally {
      if (user && clinicId) {
        try {
          await supabase.from("clinic_switch_log").insert({
            admin_id: user.id,
            from_clinic: fromClinic,
            to_clinic: clinicId,
            clinic_id: clinicId,
            access_granted: granted,
            reason,
          } as any);
        } catch {}
      }
    }
    return granted;
  }, [loadAccess, user, activeClinicId]);

  const isAuthenticated = Boolean(user);
  const isAuthReady = !authLoading && (!isAuthenticated || (!profileLoading && !roleLoading && !clinicLoading));
  const roleMissing = isAuthenticated && isAuthReady && !role;

  const effectiveClinicId = role === "super_admin"
    ? (activeClinicId || profile?.clinic_id || null)
    : (profile?.clinic_id || null);

  const value = useMemo(() => ({
    user, authLoading, profile, profileError, clinic, roles, role,
    profileLoading, roleLoading, clinicLoading,
    isAuthenticated, isAuthReady, roleMissing,
    activeClinicId, effectiveClinicId,
    switchClinic,
    reload: () => loadAccess(user, activeClinicId),
    signOut: async () => { persistActive(null); setActiveClinicIdState(null); await supabase.auth.signOut(); },
  }), [authLoading, clinic, clinicLoading, isAuthenticated, isAuthReady, loadAccess, profile, profileError, profileLoading, role, roleLoading, roleMissing, roles, user, activeClinicId, effectiveClinicId, switchClinic]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}
