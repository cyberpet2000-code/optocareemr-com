import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { assertClinicAccess } from "@/lib/route-access";
import { resolveSupabaseSessionWithRecovery, safeSupabaseStorage, setKnownSupabaseSession } from "@/lib/supabase-auth";
import { resetSupabaseAccessGate, updateSupabaseAccessGate } from "@/lib/supabase-access-gate";

const VALID_ROLES = ["super_admin", "admin", "doctor", "nurse", "receptionist"];
const ACTIVE_CLINIC_KEY = "active_clinic_id";

type BootstrapRequest = {
  hasOverride: boolean;
  session: any;
};

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

  const upsertMembership = (clinicId: string | null, role: string | null | undefined, source: "user_roles" | "clinic_users") => {
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

  userRolesRows.forEach((row) => upsertMembership(row.clinic_id, row.role, "user_roles"));
  clinicUsersRows.forEach((row) => upsertMembership(row.clinic_id, row.role, "clinic_users"));

  return Array.from(membershipMap.values());
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
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [profileError, setProfileError] = useState<any>(null);
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(() => {
    return safeSupabaseStorage.getItem(ACTIVE_CLINIC_KEY);
  });
  const [memberships, setMemberships] = useState<Array<{ clinic_id: string; role: string; clinic_name: string | null; setup_completed: boolean | null }>>([]);
  const [resolvedClinicId, setResolvedClinicId] = useState<string | null>(null);
  const [clinicResolutionFailed, setClinicResolutionFailed] = useState(false);
  const [accessLoadedForUser, setAccessLoadedForUser] = useState<string | null>(null);
  const requestRef = useRef(0);
  const bootstrapRef = useRef(0);
  const bootstrapPromiseRef = useRef<Promise<void> | null>(null);
  const pendingBootstrapRef = useRef<BootstrapRequest | null>(null);
  const userRef = useRef(user);
  const activeClinicIdRef = useRef(activeClinicId);
  const initializedRef = useRef(false);
  const authSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    activeClinicIdRef.current = activeClinicId;
  }, [activeClinicId]);

  const persistActive = (id: string | null) => {
    if (id) safeSupabaseStorage.setItem(ACTIVE_CLINIC_KEY, id);
    else safeSupabaseStorage.removeItem(ACTIVE_CLINIC_KEY);
  };

  const withTimeout = useCallback(async <T,>(promise: PromiseLike<T>, ms: number, label: string) => {
    return Promise.race<T>([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  }, []);

  const loadAccess = useCallback(async (nextUserArg?: any, overrideClinicIdArg?: string | null) => {
    const nextUser = nextUserArg ?? userRef.current;
    const overrideClinicId = overrideClinicIdArg ?? activeClinicIdRef.current;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (!nextUser) {
      setProfile(null); setClinic(null); setRoles([]); setRole(null); setMemberships([]);
      setResolvedClinicId(null); setClinicResolutionFailed(false);
      setProfileLoading(false); setRoleLoading(false); setClinicLoading(false); setMembershipLoading(false);
      setAccessLoadedForUser(null);
      setAccessReady(true);
      updateSupabaseAccessGate({ hasSession: false, accessReady: true, userId: null });
      applyClinicTheme(null);
      return;
    }

    setAccessReady(false);
    setProfileLoading(true); setRoleLoading(true); setClinicLoading(true); setMembershipLoading(true);
    setProfileError(null);
    updateSupabaseAccessGate({ hasSession: true, accessReady: false, userId: nextUser.id });
    // eslint-disable-next-line no-console
    console.debug("[access:init]", { user_id: nextUser.id, override_clinic_id: overrideClinicId });

    try {
      const [profileResult, userRolesResult, clinicUsersResult] = await withTimeout(
        Promise.all([
          apiClient.from("profiles").select("*").eq("id", nextUser.id).maybeSingle(),
          apiClient.from("user_roles").select("role, clinic_id").eq("user_id", nextUser.id),
          apiClient.from("clinic_users").select("role, clinic_id").eq("user_id", nextUser.id),
        ]),
        10000,
        "Access bootstrap",
      );
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
        membershipRows = mergeMemberships({ userRolesRows, clinicUsersRows, clinicMap });
      }
      setMemberships(membershipRows);
      setMembershipLoading(false);

      setProfile(nextProfile);
      setProfileError(profileResult.error || null);
      setRoles(nextRoles);
      setRole(primaryRole);
      setProfileLoading(false);
      setRoleLoading(false);
      const membershipsReady = true;
      // eslint-disable-next-line no-console
      console.debug("[access:profile]", {
        user_id: nextUser.id,
        profile_loaded: !!nextProfile,
        primary_role: primaryRole,
        memberships: membershipRows.length,
        memberships_ready: membershipsReady,
        clinic_user_memberships: clinicUsersRows.length,
      });

      const isSuper =
        primaryRole === "super_admin" || nextProfile?.is_super_admin === true;

      // SUPER ADMIN SHORT-CIRCUIT: platform-level role.
      // Never require clinic_id, user_active_clinic, subscription, or trial.
      // Optional explicit override (via switchClinic) loads that clinic only.
      if (isSuper) {
        setResolvedClinicId(null);
        setClinicResolutionFailed(false);
        const overrideId = overrideClinicId || null;
        let clinicData: any = null;
        if (overrideId) {
          try {
            const { data } = await withTimeout(
              apiClient
                .from("clinics")
                .select("id, name, subscription_status, trial_start_date, trial_end_date, setup_completed, onboarding_step, is_active, lifecycle_status, theme_color, secondary_color, logo_url")
                .eq("id", overrideId)
                .maybeSingle(),
              10000,
              "Super admin clinic override load",
            );
            clinicData = data || null;
          } catch (e: any) {
            // eslint-disable-next-line no-console
            console.warn("[access:super_admin_clinic_override_failed]", { message: e?.message });
          }
        }
        setClinic(clinicData);
        setClinicLoading(false);
        setMembershipLoading(false);
        applyClinicTheme(clinicData);
        setAccessLoadedForUser(nextUser.id);
        setAccessReady(true);
        updateSupabaseAccessGate({ hasSession: true, accessReady: true, userId: nextUser.id });
        // eslint-disable-next-line no-console
        console.debug("[access:super_admin_ready]", {
          user_id: nextUser.id,
          override_clinic_id: overrideId,
          clinic_loaded: !!clinicData,
        });
        return;
      }

      // Non-super-admin: SINGLE SOURCE OF TRUTH = backend-resolved clinic id.
      const { data: resolvedRow, error: resolvedError } = await withTimeout(
        apiClient
          .from("user_active_clinic")
          .select("resolved_clinic_id, is_super_admin")
          .eq("id", nextUser.id)
          .maybeSingle(),
        10000,
        "Resolved clinic lookup",
      );
      if (requestRef.current !== requestId) return;
      if (resolvedError) throw resolvedError;

      const backendResolvedClinicId = (resolvedRow as any)?.resolved_clinic_id ?? null;
      setResolvedClinicId(backendResolvedClinicId);

      // Non-super-admin: resolved_clinic_id is the ONLY allowed value.
      const effectiveClinicId = backendResolvedClinicId;

      // Drop any stale persisted override that isn't valid for this user.
      if (overrideClinicId && overrideClinicId !== backendResolvedClinicId) {
        persistActive(null);
        setActiveClinicIdState(null);
      }

      // eslint-disable-next-line no-console
      console.debug("[access:resolved_clinic]", {
        user_id: nextUser.id,
        resolved_clinic_id: backendResolvedClinicId,
        is_super_admin: false,
        effective_clinic_id: effectiveClinicId,
        memberships: membershipRows.length,
      });

      if (!effectiveClinicId) {
        // Hard stop. No fallback guessing. Consumers route to /select-clinic.
        setClinicResolutionFailed(true);
        // eslint-disable-next-line no-console
        console.warn("[access:clinic_fallback_screen]", {
          user_id: nextUser.id,
          reason: "resolved_clinic_id missing",
          memberships: membershipRows.length,
        });
        setClinic(null); setClinicLoading(false); applyClinicTheme(null);
        setMembershipLoading(false);
        setAccessLoadedForUser(nextUser.id);
        setAccessReady(true);
        updateSupabaseAccessGate({ hasSession: true, accessReady: true, userId: nextUser.id });
        // eslint-disable-next-line no-console
        console.debug("[access:ready]", { user_id: nextUser.id, clinic_id: null, clinic_loaded: false });
        return;
      }

      setClinicResolutionFailed(false);

      const clinicResult = await withTimeout(
        apiClient
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
      setMembershipLoading(false);
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
      // Do NOT nuke profile/role here — if we got far enough to know the role
      // (esp. super_admin), keep it so the user is not falsely shown as
      // "User role not configured". Only mark clinic resolution failed.
      setClinic(null);
      setResolvedClinicId(null);
      setClinicResolutionFailed(true);
      setProfileError(error);
      setProfileLoading(false);
      setRoleLoading(false);
      setClinicLoading(false);
      setMembershipLoading(false);
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
  }, [withTimeout]);

  useEffect(() => {
    let mounted = true;
    if (initializedRef.current) {
      return () => {
        mounted = false;
      };
    }
    initializedRef.current = true;

    const clearResolvedAccessState = (nextUserId: string | null) => {
      setProfile(null);
      setClinic(null);
      setRoles([]);
      setRole(null);
      setMemberships([]);
      setResolvedClinicId(null);
      setClinicResolutionFailed(false);
      setProfileLoading(false);
      setRoleLoading(false);
      setClinicLoading(false);
      setMembershipLoading(false);
      setAccessLoadedForUser(nextUserId);
      setAccessReady(true);
    };

    const runBootstrap = async (request: BootstrapRequest) => {
      const bootstrapId = bootstrapRef.current + 1;
      bootstrapRef.current = bootstrapId;

      resetSupabaseAccessGate();
      setAuthLoading(true);
      // eslint-disable-next-line no-console
      console.debug("[auth:init:start]", {
        bootstrapId,
        hasOverride: request.hasOverride,
        user_id: request.session?.user?.id ?? null,
      });

      try {
        const resolved = await resolveSupabaseSessionWithRecovery(
          apiClient.auth,
          request.hasOverride ? { sessionOverride: request.session } : undefined,
        );
        const session = resolved.session;

        if (!mounted || bootstrapRef.current !== bootstrapId) return;
        // eslint-disable-next-line no-console
        console.debug("[auth:init]", {
          hasSession: !!session,
          user_id: session?.user?.id ?? null,
          tokenPresent: !!session?.access_token,
          recovered: resolved.recovered,
          source: resolved.source,
          storageAvailable: resolved.storageAvailable,
          error: resolved.error?.message ?? null,
        });

        setUser(session?.user ?? null);
        setKnownSupabaseSession(session ?? null);
        updateSupabaseAccessGate({
          sessionBootstrapped: true,
          hasSession: !!session,
          accessReady: !session?.user,
          userId: session?.user?.id ?? null,
        });

        if (!session?.user) {
          clearResolvedAccessState(null);
          setAuthLoading(false);
          // eslint-disable-next-line no-console
          console.debug("[auth:init:end]", { bootstrapId, hasSession: false, user_id: null });
          return;
        }

        await loadAccess(session.user, activeClinicIdRef.current);

        if (!mounted || bootstrapRef.current !== bootstrapId) return;
        setAuthLoading(false);
        // eslint-disable-next-line no-console
        console.debug("[auth:init:end]", { bootstrapId, hasSession: true, user_id: session.user.id });
      } catch (error: any) {
        if (!mounted || bootstrapRef.current !== bootstrapId) return;
        // eslint-disable-next-line no-console
        console.error("[auth:init:error]", { message: error?.message || "Unknown auth bootstrap error" });
        setUser(null);
        setKnownSupabaseSession(null);
        clearResolvedAccessState(null);
        updateSupabaseAccessGate({ sessionBootstrapped: true, hasSession: false, accessReady: true, userId: null });
        setAuthLoading(false);
        // eslint-disable-next-line no-console
        console.debug("[auth:init:end]", { bootstrapId, hasSession: false, user_id: null, errored: true });
      }
    };

    const scheduleBootstrap = (...args: [any?]) => {
      const request: BootstrapRequest = {
        hasOverride: args.length > 0,
        session: args.length > 0 ? args[0] : null,
      };

      pendingBootstrapRef.current = request;
      if (bootstrapPromiseRef.current) {
        // eslint-disable-next-line no-console
        console.debug("[auth:bootstrap:queued]", {
          hasOverride: request.hasOverride,
          user_id: request.session?.user?.id ?? null,
        });
        return bootstrapPromiseRef.current;
      }

      const promise = (async () => {
        while (mounted && pendingBootstrapRef.current) {
          const nextRequest = pendingBootstrapRef.current;
          pendingBootstrapRef.current = null;
          await runBootstrap(nextRequest);
        }
      })().finally(() => {
        if (bootstrapPromiseRef.current === promise) {
          bootstrapPromiseRef.current = null;
        }
      });

      bootstrapPromiseRef.current = promise;
      return promise;
    };

    void scheduleBootstrap();

    const { data: { subscription } } = apiClient.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // eslint-disable-next-line no-console
      console.debug("[auth:event]", event, {
        user_id: session?.user?.id ?? null,
        tokenPresent: !!session?.access_token,
      });

      // Ignore initial replay — the explicit bootstrap above handles it.
      if (event === "INITIAL_SESSION") return;

      // Token refresh / user update: keep current access state, just refresh
      // the cached session + user. Do NOT re-run the full bootstrap, which
      // would flip accessReady=false and cause transient redirects to /login.
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setKnownSupabaseSession(session ?? null);
        if (session?.user) {
          setUser((prev: any) => (prev?.id === session.user.id ? prev : session.user));
        }
        // eslint-disable-next-line no-console
        console.debug("[auth:session:change]", {
          event,
          hasSession: !!session,
          user_id: session?.user?.id ?? null,
          tokenPresent: !!session?.access_token,
        });
        updateSupabaseAccessGate({
          sessionBootstrapped: true,
          hasSession: !!session,
          accessReady: true,
          userId: session?.user?.id ?? null,
        });
        return;
      }

      if (event === "SIGNED_OUT" || !session?.user) {
        persistActive(null);
        setActiveClinicIdState(null);
        setAccessLoadedForUser(null);
        setUser(null);
        setKnownSupabaseSession(null);
        updateSupabaseAccessGate({ sessionBootstrapped: true, hasSession: false, accessReady: true, userId: null });
        return;
      }

      // SIGNED_IN (or other auth-changing event with a user): re-bootstrap.
      void scheduleBootstrap(session);
    });

    authSubscriptionRef.current = subscription;

    return () => {
      mounted = false;
      pendingBootstrapRef.current = null;
      authSubscriptionRef.current?.unsubscribe();
      authSubscriptionRef.current = null;
      initializedRef.current = false;
    };
  }, [loadAccess]);

  const switchClinic = useCallback(async (clinicId: string | null) => {
    const fromClinic = activeClinicId;
    let granted = true;
    let reason: string | null = null;

    // SINGLE SOURCE OF TRUTH: every user (including super_admin) must have a user_roles
    // record for the target clinic. No bypasses.
    if (clinicId && user) {
      const grantedRole = await assertClinicAccess(apiClient as any, user.id, clinicId);
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
  const isAuthReady = !authLoading && accessReady && (!isAuthenticated || (accessReadyForCurrentUser && !profileLoading && !roleLoading && !clinicLoading && !membershipLoading));
  const isSuperAdminUser = role === "super_admin" || profile?.is_super_admin === true;
  // Super admins are NEVER blocked by missing role/clinic state.
  const roleMissing = isAuthenticated && isAuthReady && !role && !isSuperAdminUser;

  // Deterministic: backend-resolved clinic id only. Super admin may override
  // via switchClinic; nobody else gets fallback guessing.
  const effectiveClinicId = isSuperAdminUser
    ? (activeClinicId || resolvedClinicId || null)
    : resolvedClinicId;

  const value = useMemo(() => ({
    user, authLoading, profile, profileError, clinic, roles, role, memberships,
    profileLoading, roleLoading, clinicLoading, membershipLoading,
    isAuthenticated, isAuthReady, accessReady, roleMissing,
    activeClinicId, effectiveClinicId, resolvedClinicId, clinicResolutionFailed,
    switchClinic,
    reload: () => loadAccess(user, activeClinicId),
    signOut: async () => { persistActive(null); setActiveClinicIdState(null); await apiClient.auth.signOut(); },
  }), [accessReady, authLoading, clinic, clinicLoading, isAuthenticated, isAuthReady, loadAccess, profile, profileError, profileLoading, role, roleLoading, roleMissing, roles, user, activeClinicId, effectiveClinicId, resolvedClinicId, clinicResolutionFailed, switchClinic, memberships, membershipLoading, accessLoadedForUser]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}
