import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { assertClinicAccess } from "@/lib/route-access";
import { updateSupabaseAccessGate } from "@/lib/supabase-access-gate";

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
  const [accessReady, setAccessReady] = useState(false);
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
  const [accessLoadedForUser, setAccessLoadedForUser] = useState<string | null>(null);
  const requestRef = useRef(0);

  const persistActive = (id: string | null) => {
    try {
      if (id) localStorage.setItem(ACTIVE_CLINIC_KEY, id);
      else localStorage.removeItem(ACTIVE_CLINIC_KEY);
    } catch {}
  };

  const withTimeout = useCallback(async <T,>(promise: PromiseLike<T>, ms: number, label: string) => {
    return Promise.race<T>([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  }, []);

  const loadAccess = useCallback(async (nextUser = user, overrideClinicId: string | null = activeClinicId) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (!nextUser) {
      setProfile(null); setClinic(null); setRoles([]); setRole(null); setMemberships([]);
      setProfileLoading(false); setRoleLoading(false); setClinicLoading(false);
      setAccessLoadedForUser(null);
      setAccessReady(true);
      updateSupabaseAccessGate({ hasSession: false, accessReady: true, userId: null });
      applyClinicTheme(null);
      return;
    }

    setAccessReady(false);
    setProfileLoading(true); setRoleLoading(true); setClinicLoading(true);
    setProfileError(null);
    updateSupabaseAccessGate({ hasSession: true, accessReady: false, userId: nextUser.id });
    // eslint-disable-next-line no-console
    console.debug("[access:init]", { user_id: nextUser.id, override_clinic_id: overrideClinicId });

    try {
      const [profileResult, userRolesResult] = await withTimeout(
        Promise.all([
          apiClient.from("profiles").select("*").eq("id", nextUser.id).maybeSingle(),
          apiClient.from("user_roles").select("role, clinic_id").eq("user_id", nextUser.id),
        ]),
        10000,
        "Access bootstrap",
      );
      if (requestRef.current !== requestId) return;

      const nextProfile = profileResult.data || null;
      const userRolesRows = (userRolesResult.data || []) as Array<{ role: string; clinic_id: string | null }>;
      const fallbackRoles = userRolesRows.map(r => normalizeRole(r.role)).filter(Boolean) as string[];
      const primaryRole = resolvePrimaryRole(nextProfile, fallbackRoles);
      const nextRoles = Array.from(new Set([primaryRole, ...fallbackRoles].filter(Boolean))) as string[];

      const membershipClinicIds = Array.from(new Set(userRolesRows.map(r => r.clinic_id).filter(Boolean) as string[]));
      let membershipRows: typeof memberships = [];
      if (membershipClinicIds.length) {
        const { data: clinicsData, error: clinicsError } = await withTimeout(
          apiClient
            .from("clinics")
            .select("id, name, setup_completed")
            .in("id", membershipClinicIds),
          10000,
          "Clinic membership lookup",
        );
        if (clinicsError) throw clinicsError;
        const clinicMap = new Map((clinicsData || []).map((c: any) => [c.id, c]));
        membershipRows = userRolesRows
          .filter(r => r.clinic_id)
          .map(r => {
            const c: any = clinicMap.get(r.clinic_id as string);
            return {
              clinic_id: r.clinic_id as string,
              role: r.role,
              clinic_name: c?.name ?? null,
              setup_completed: c?.setup_completed ?? null,
            };
          });
      }
      setMemberships(membershipRows);

      setProfile(nextProfile);
      setProfileError(profileResult.error || null);
      setRoles(nextRoles);
      setRole(primaryRole);
      setProfileLoading(false);
      setRoleLoading(false);
      // eslint-disable-next-line no-console
      console.debug("[access:profile]", {
        user_id: nextUser.id,
        profile_loaded: !!nextProfile,
        primary_role: primaryRole,
        memberships: membershipRows.length,
      });

      const isSuper = primaryRole === "super_admin";
      const hasMembershipForOverride = overrideClinicId
        ? membershipRows.some(m => m.clinic_id === overrideClinicId)
        : false;
      const validatedOverride = hasMembershipForOverride ? overrideClinicId : null;
      if (overrideClinicId && !hasMembershipForOverride && !isSuper) {
        persistActive(null);
        setActiveClinicIdState(null);
      }
      const effectiveClinicId = isSuper
        ? overrideClinicId
        : (validatedOverride || (membershipRows.some(m => m.clinic_id === nextProfile?.clinic_id) ? nextProfile?.clinic_id : null) || null);

      if (!effectiveClinicId) {
        setClinic(null); setClinicLoading(false); applyClinicTheme(null);
        setAccessLoadedForUser(nextUser.id);
        setAccessReady(true);
        updateSupabaseAccessGate({ hasSession: true, accessReady: true, userId: nextUser.id });
        // eslint-disable-next-line no-console
        console.debug("[access:ready]", { user_id: nextUser.id, clinic_id: null, clinic_loaded: false });
        return;
      }

      const clinicResult = await withTimeout(
        supabase
          .from("clinics")
          .select("id, name, subscription_status, trial_start_date, trial_end_date, setup_completed, onboarding_step, is_active, lifecycle_status, theme_color, secondary_color, logo_url")
          .eq("id", effectiveClinicId)
          .maybeSingle(),
        10000,
        "Clinic load",
      );
      if (requestRef.current !== requestId) return;

      setClinic(clinicResult.data || null);
      setClinicLoading(false);
      applyClinicTheme(clinicResult.data || null);
      setAccessLoadedForUser(nextUser.id);
      setAccessReady(true);
      updateSupabaseAccessGate({ hasSession: true, accessReady: true, userId: nextUser.id });
      // eslint-disable-next-line no-console
      console.debug("[access:clinic]", {
        user_id: nextUser.id,
        role: primaryRole,
        clinic_id: effectiveClinicId,
        clinic_loaded: !!clinicResult.data,
        lifecycle_status: (clinicResult.data as any)?.lifecycle_status ?? null,
        memberships: membershipRows.length,
      });
    } catch (error: any) {
      if (requestRef.current !== requestId) return;
      setProfile(null);
      setClinic(null);
      setRoles([]);
      setRole(null);
      setMemberships([]);
      setProfileError(error);
      setProfileLoading(false);
      setRoleLoading(false);
      setClinicLoading(false);
      setAccessLoadedForUser(nextUser.id);
      setAccessReady(true);
      updateSupabaseAccessGate({ hasSession: true, accessReady: true, userId: nextUser.id });
      applyClinicTheme(null);
      // eslint-disable-next-line no-console
      console.error("[access:error]", {
        user_id: nextUser.id,
        message: error?.message || "Unknown access error",
      });
    }
  }, [user, activeClinicId]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      let session = null as any;
      updateSupabaseAccessGate({ sessionBootstrapped: false, hasSession: false, accessReady: false, userId: null });
      try {
        const r1 = await apiClient.auth.getSession();
        session = r1.data.session;
        if (!session) {
          // Retry once — desktop browsers occasionally race storage hydration
          await new Promise((res) => setTimeout(res, 150));
          const r2 = await apiClient.auth.getSession();
          session = r2.data.session;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[auth:getSession] failed", e);
      }
      if (!mounted) return;
      // eslint-disable-next-line no-console
      console.debug("[auth:init]", {
        hasSession: !!session,
        user_id: session?.user?.id ?? null,
        tokenPresent: !!session?.access_token,
      });
      setUser(session?.user ?? null);
      setAuthLoading(false);
      updateSupabaseAccessGate({
        sessionBootstrapped: true,
        hasSession: !!session,
        accessReady: !session,
        userId: session?.user?.id ?? null,
      });
    };
    void init();
    const { data: { subscription } } = apiClient.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // eslint-disable-next-line no-console
      console.debug("[auth:event]", event, {
        user_id: session?.user?.id ?? null,
        tokenPresent: !!session?.access_token,
      });
      setUser(session?.user ?? null);
      setAuthLoading(false);
      setAccessReady(!session?.user);
      updateSupabaseAccessGate({
        sessionBootstrapped: true,
        hasSession: !!session?.user,
        accessReady: !session?.user,
        userId: session?.user?.id ?? null,
      });
      if (!session?.user) {
        persistActive(null);
        setActiveClinicIdState(null);
        setAccessLoadedForUser(null);
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
    let granted = true;
    let reason: string | null = null;

    // SINGLE SOURCE OF TRUTH: every user (including super_admin) must have a user_roles
    // record for the target clinic. No bypasses.
    if (clinicId && user) {
      const grantedRole = await assertClinicAccess(supabase as any, user.id, clinicId);
      if (!grantedRole) {
        granted = false;
        reason = "no membership in target clinic";
        // Log denial then throw
        try {
          await apiClient.from("clinic_switch_log").insert({
            admin_id: user.id,
            from_clinic: fromClinic,
            to_clinic: clinicId,
            clinic_id: clinicId,
            access_granted: false,
            reason,
          } as any);
        } catch {}
        throw new Error("You do not have access to this clinic.");
      }
    }

    persistActive(clinicId);
    setActiveClinicIdState(clinicId);
    try {
      await loadAccess(user, clinicId);
    } catch (e: any) {
      granted = false;
      reason = e?.message || "load failed";
      throw e;
    } finally {
      if (user && clinicId) {
        try {
          await apiClient.from("clinic_switch_log").insert({
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
  }, [loadAccess, user, activeClinicId, role, profile]);

  const isAuthenticated = Boolean(user);
  const accessReadyForCurrentUser = !isAuthenticated || (accessLoadedForUser === user?.id);
  const isAuthReady = !authLoading && accessReady && (!isAuthenticated || (accessReadyForCurrentUser && !profileLoading && !roleLoading && !clinicLoading));
  const roleMissing = isAuthenticated && isAuthReady && !role;

  const hasMembershipForActive = activeClinicId
    ? memberships.some(m => m.clinic_id === activeClinicId)
    : false;
  const effectiveClinicId = role === "super_admin"
    ? activeClinicId   // super admin: any clinic, no membership needed
    : (hasMembershipForActive
        ? activeClinicId
        : (memberships.some(m => m.clinic_id === profile?.clinic_id) ? profile?.clinic_id : null) || null);

  const value = useMemo(() => ({
    user, authLoading, profile, profileError, clinic, roles, role, memberships,
    profileLoading, roleLoading, clinicLoading,
    isAuthenticated, isAuthReady, accessReady, roleMissing,
    activeClinicId, effectiveClinicId,
    switchClinic,
    reload: () => loadAccess(user, activeClinicId),
    signOut: async () => { persistActive(null); setActiveClinicIdState(null); await apiClient.auth.signOut(); },
  }), [accessReady, authLoading, clinic, clinicLoading, isAuthenticated, isAuthReady, loadAccess, profile, profileError, profileLoading, role, roleLoading, roleMissing, roles, user, activeClinicId, effectiveClinicId, switchClinic, memberships, accessLoadedForUser]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}
