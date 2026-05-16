import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { apiClient } from "@/lib/apiClient";
import { assertClinicAccess } from "@/lib/route-access";
import { safeSupabaseStorage, setKnownSupabaseSession } from "@/lib/supabase-auth";

const VALID_ROLES = ["super_admin", "admin", "doctor", "nurse", "receptionist"];
const ACTIVE_CLINIC_KEY = "active_clinic_id";

type MembershipRow = {
  clinic_id: string;
  role: string;
  clinic_name: string | null;
  setup_completed: boolean | null;
};

function normalizeRole(value?: string | null) {
  return value && VALID_ROLES.includes(value) ? value : null;
}

function resolvePrimaryRole(profile: any, userRoles: string[]) {
  if (profile?.is_super_admin || profile?.role === "super_admin") return "super_admin";
  const profileRole = normalizeRole(profile?.role);
  if (profileRole) return profileRole;
  return userRoles.find((r) => normalizeRole(r)) || null;
}

function mergeMemberships({
  userRolesRows,
  clinicUsersRows,
  clinicMap,
}: {
  userRolesRows: Array<{ role: string; clinic_id: string | null }>;
  clinicUsersRows: Array<{ role: string | null; clinic_id: string | null }>;
  clinicMap: Map<string, any>;
}): MembershipRow[] {
  const membershipMap = new Map<string, MembershipRow>();
  const upsert = (clinicId: string | null, role: string | null | undefined, source: "user_roles" | "clinic_users") => {
    if (!clinicId) return;
    const normalizedRole = normalizeRole(role);
    const clinic = clinicMap.get(clinicId);
    const existing = membershipMap.get(clinicId);
    const preferredRole = source === "user_roles"
      ? (normalizedRole ?? existing?.role ?? "admin")
      : (existing?.role ?? normalizedRole ?? "admin");
    membershipMap.set(clinicId, {
      clinic_id: clinicId,
      role: preferredRole,
      clinic_name: clinic?.name ?? existing?.clinic_name ?? null,
      setup_completed: clinic?.setup_completed ?? existing?.setup_completed ?? null,
    });
  };
  userRolesRows.forEach((r) => upsert(r.clinic_id, r.role, "user_roles"));
  clinicUsersRows.forEach((r) => upsert(r.clinic_id, r.role, "clinic_users"));
  return Array.from(membershipMap.values());
}

// Theme is now a single static global theme — no runtime clinic theme hydration.

const AccessContext = createContext<any>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessReady, setAccessReady] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [clinic, setClinic] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<any>(null);
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(() =>
    safeSupabaseStorage.getItem(ACTIVE_CLINIC_KEY),
  );
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [resolvedClinicId, setResolvedClinicId] = useState<string | null>(null);
  const [clinicResolutionFailed, setClinicResolutionFailed] = useState(false);
  const requestRef = useRef(0);
  const activeClinicIdRef = useRef(activeClinicId);
  const userRef = useRef(user);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { activeClinicIdRef.current = activeClinicId; }, [activeClinicId]);

  const persistActive = (id: string | null) => {
    if (id) safeSupabaseStorage.setItem(ACTIVE_CLINIC_KEY, id);
    else safeSupabaseStorage.removeItem(ACTIVE_CLINIC_KEY);
  };

  const clearAccessState = useCallback(() => {
    setProfile(null); setClinic(null); setRoles([]); setRole(null);
    setMemberships([]); setResolvedClinicId(null); setClinicResolutionFailed(false);
    setProfileError(null);
    
  }, []);

  // Single profile + role + clinic loader. Called after auth resolves.
  const loadAccess = useCallback(async (nextUser: User | null, overrideClinicId: string | null) => {
    const requestId = ++requestRef.current;

    if (!nextUser) {
      clearAccessState();
      setAccessReady(true);
      return;
    }

    setAccessReady(false);
    setProfileError(null);
    // eslint-disable-next-line no-console
    console.debug("[access:load:start]", { user_id: nextUser.id, override_clinic_id: overrideClinicId });

    try {
      const [profileResult, userRolesResult, clinicUsersResult] = await Promise.all([
        apiClient.from("profiles").select("*").eq("id", nextUser.id).maybeSingle(),
        apiClient.from("user_roles").select("role, clinic_id").eq("user_id", nextUser.id),
        apiClient.from("clinic_users").select("role, clinic_id").eq("user_id", nextUser.id),
      ]);
      if (requestRef.current !== requestId) return;

      const nextProfile = profileResult.data || null;
      const userRolesRows = (userRolesResult.data || []) as Array<{ role: string; clinic_id: string | null }>;
      const clinicUsersRows = (clinicUsersResult.data || []) as Array<{ role: string | null; clinic_id: string | null }>;
      const fallbackRoles = Array.from(new Set([
        ...userRolesRows.map((r) => normalizeRole(r.role)),
        ...clinicUsersRows.map((r) => normalizeRole(r.role)),
      ].filter(Boolean))) as string[];
      const primaryRole = resolvePrimaryRole(nextProfile, fallbackRoles);
      const nextRoles = Array.from(new Set([primaryRole, ...fallbackRoles].filter(Boolean))) as string[];

      const membershipClinicIds = Array.from(new Set([
        ...userRolesRows.map((r) => r.clinic_id),
        ...clinicUsersRows.map((r) => r.clinic_id),
      ].filter(Boolean) as string[]));
      let membershipRows: MembershipRow[] = [];
      if (membershipClinicIds.length) {
        const { data: clinicsData } = await apiClient
          .from("clinics")
          .select("id, name, setup_completed")
          .in("id", membershipClinicIds);
        if (requestRef.current !== requestId) return;
        const clinicMap = new Map((clinicsData || []).map((c: any) => [c.id, c]));
        membershipRows = mergeMemberships({ userRolesRows, clinicUsersRows, clinicMap });
      }

      setMemberships(membershipRows);
      setProfile(nextProfile);
      setProfileError(profileResult.error || null);
      setRoles(nextRoles);
      setRole(primaryRole);

      const isSuper = primaryRole === "super_admin" || nextProfile?.is_super_admin === true;

      // SUPER ADMIN: bypass clinic / lifecycle / membership enforcement.
      if (isSuper) {
        setResolvedClinicId(null);
        setClinicResolutionFailed(false);
        let clinicData: any = null;
        if (overrideClinicId) {
          try {
            const { data } = await apiClient
              .from("clinics")
              .select("id, name, subscription_status, setup_completed, onboarding_step, is_active, lifecycle_status, logo_url")
              .eq("id", overrideClinicId)
              .maybeSingle();
            clinicData = data || null;
          } catch (e: any) {
            // eslint-disable-next-line no-console
            console.warn("[access:super_admin_clinic_override_failed]", { message: e?.message });
          }
        }
        if (requestRef.current !== requestId) return;
        setClinic(clinicData);
        
        setAccessReady(true);
        // eslint-disable-next-line no-console
        console.debug("[access:super_admin_ready]", { user_id: nextUser.id, override_clinic_id: overrideClinicId });
        return;
      }

      // Non-super: resolved_clinic_id is the only allowed clinic.
      const { data: resolvedRow, error: resolvedError } = await apiClient
        .from("user_active_clinic")
        .select("resolved_clinic_id, is_super_admin")
        .eq("id", nextUser.id)
        .maybeSingle();
      if (requestRef.current !== requestId) return;
      if (resolvedError) throw resolvedError;

      const backendResolvedClinicId = (resolvedRow as any)?.resolved_clinic_id ?? null;
      setResolvedClinicId(backendResolvedClinicId);

      if (overrideClinicId && overrideClinicId !== backendResolvedClinicId) {
        persistActive(null);
        setActiveClinicIdState(null);
      }

      if (!backendResolvedClinicId) {
        setClinic(null);
        setClinicResolutionFailed(true);
        
        setAccessReady(true);
        // eslint-disable-next-line no-console
        console.debug("[access:no_clinic]", { user_id: nextUser.id });
        return;
      }

      setClinicResolutionFailed(false);
      const clinicResult = await apiClient
        .from("clinics")
        .select("id, name, subscription_status, setup_completed, onboarding_step, is_active, lifecycle_status, logo_url")
        .eq("id", backendResolvedClinicId)
        .maybeSingle();
      if (requestRef.current !== requestId) return;

      setClinic(clinicResult.data || null);
      
      setAccessReady(true);
      // eslint-disable-next-line no-console
      console.debug("[access:ready]", {
        user_id: nextUser.id,
        role: primaryRole,
        clinic_id: backendResolvedClinicId,
      });
    } catch (error: any) {
      if (requestRef.current !== requestId) return;
      // Keep any role we may have resolved; only mark clinic resolution failed.
      setClinic(null);
      setResolvedClinicId(null);
      setClinicResolutionFailed(true);
      setProfileError(error);
      
      setAccessReady(true);
      // eslint-disable-next-line no-console
      console.error("[access:error]", { user_id: nextUser.id, message: error?.message });
    }
  }, [clearAccessState]);

  // ===== Single bootstrap + single auth listener =====
  useEffect(() => {
    let mounted = true;

    const applySession = async (session: Session | null, reason: string) => {
      if (!mounted) return;
      setKnownSupabaseSession(session);
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      // eslint-disable-next-line no-console
      console.debug("[auth:apply]", { reason, hasSession: !!session, user_id: nextUser?.id ?? null });
      await loadAccess(nextUser, activeClinicIdRef.current);
      if (!mounted) return;
      setAuthLoading(false);
    };

    // 1) Subscribe FIRST so we never miss an event.
    const { data: { subscription } } = apiClient.auth.onAuthStateChange((event, session) => {
      // eslint-disable-next-line no-console
      console.debug("[auth:event]", event, { user_id: session?.user?.id ?? null });

      // INITIAL_SESSION is handled by the explicit getSession() below.
      if (event === "INITIAL_SESSION") return;

      // Keep cached session fresh; do NOT clear it during refreshes/updates.
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setKnownSupabaseSession(session ?? null);
        if (session?.user) {
          setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        persistActive(null);
        setActiveClinicIdState(null);
        setKnownSupabaseSession(null);
        setUser(null);
        clearAccessState();
        setAccessReady(true);
        setAuthLoading(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        void applySession(session, event);
      }
    });

    // 2) Then restore the existing session from storage (single call).
    (async () => {
      try {
        const { data } = await apiClient.auth.getSession();
        await applySession(data.session ?? null, "bootstrap");
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error("[auth:bootstrap:error]", { message: error?.message });
        if (!mounted) return;
        setKnownSupabaseSession(null);
        setUser(null);
        clearAccessState();
        setAccessReady(true);
        setAuthLoading(false);
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchClinic = useCallback(async (clinicId: string | null) => {
    if (clinicId && user) {
      const grantedRole = await assertClinicAccess(apiClient as any, user.id, clinicId);
      if (!grantedRole) {
        throw new Error("You do not have access to this clinic.");
      }
    }
    persistActive(clinicId);
    setActiveClinicIdState(clinicId);
    await loadAccess(user, clinicId);
    return true;
  }, [loadAccess, user]);

  const isAuthenticated = !!user;
  const isAuthReady = !authLoading && (!isAuthenticated || accessReady);
  const isSuperAdminUser = role === "super_admin" || profile?.is_super_admin === true;
  const roleMissing = isAuthenticated && isAuthReady && !role && !isSuperAdminUser;

  const effectiveClinicId = isSuperAdminUser
    ? (activeClinicId || resolvedClinicId || null)
    : resolvedClinicId;

  const value = useMemo(() => ({
    user, authLoading, profile, profileError, clinic, roles, role, memberships,
    profileLoading: !accessReady && isAuthenticated,
    roleLoading: !accessReady && isAuthenticated,
    clinicLoading: !accessReady && isAuthenticated,
    membershipLoading: !accessReady && isAuthenticated,
    isAuthenticated, isAuthReady, accessReady, roleMissing,
    activeClinicId, effectiveClinicId, resolvedClinicId, clinicResolutionFailed,
    switchClinic,
    reload: () => loadAccess(user, activeClinicId),
    signOut: async () => {
      persistActive(null);
      setActiveClinicIdState(null);
      await apiClient.auth.signOut();
    },
  }), [accessReady, authLoading, clinic, isAuthenticated, isAuthReady, loadAccess, profile, profileError, role, roleMissing, roles, user, activeClinicId, effectiveClinicId, resolvedClinicId, clinicResolutionFailed, switchClinic, memberships]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}
