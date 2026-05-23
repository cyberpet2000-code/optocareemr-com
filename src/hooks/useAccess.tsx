import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { apiClient } from "@/lib/apiClient";
import { assertClinicAccess } from "@/lib/route-access";
import { safeSupabaseStorage, setKnownSupabaseSession } from "@/lib/supabase-auth";

const VALID_ROLES = ["super_admin", "admin", "doctor", "nurse", "receptionist"];
const ACTIVE_CLINIC_KEY = "active_clinic_id";
const ROLE_ORDER = new Map(VALID_ROLES.map((role, index) => [role, index]));

type MembershipRow = {
  clinic_id: string;
  role: string;
  clinic_name: string | null;
  setup_completed: boolean | null;
};

type AccessState = {
  accessReady: boolean;
  profile: any | null;
  clinic: any | null;
  roles: string[];
  role: string | null;
  profileError: any;
  memberships: MembershipRow[];
  resolvedClinicId: string | null;
  clinicResolutionFailed: boolean;
};

function createEmptyAccessState(accessReady = false): AccessState {
  return {
    accessReady,
    profile: null,
    clinic: null,
    roles: [],
    role: null,
    profileError: null,
    memberships: [],
    resolvedClinicId: null,
    clinicResolutionFailed: false,
  };
}

function sortRoles(roles: string[]) {
  return [...roles].sort((left, right) => {
    const leftOrder = ROLE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = ROLE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.localeCompare(right);
  });
}

function sortMemberships(rows: MembershipRow[]) {
  return [...rows].sort((left, right) => {
    const leftName = left.clinic_name ?? "";
    const rightName = right.clinic_name ?? "";
    const byName = leftName.localeCompare(rightName);
    if (byName !== 0) return byName;
    return left.clinic_id.localeCompare(right.clinic_id);
  });
}

function shallowEqualObjects(left: Record<string, any> | null, right: Record<string, any> | null) {
  if (left === right) return true;
  if (!left || !right) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => left[key] === right[key]);
}

function sameMemberships(left: MembershipRow[], right: MembershipRow[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  return left.every((item, index) => {
    const next = right[index];
    return !!next
      && item.clinic_id === next.clinic_id
      && item.role === next.role
      && item.clinic_name === next.clinic_name
      && item.setup_completed === next.setup_completed;
  });
}

function sameRoles(left: string[], right: string[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((role, index) => role === right[index]);
}

function sameAccessState(left: AccessState, right: AccessState) {
  return left.accessReady === right.accessReady
    && left.role === right.role
    && left.profileError === right.profileError
    && left.resolvedClinicId === right.resolvedClinicId
    && left.clinicResolutionFailed === right.clinicResolutionFailed
    && sameRoles(left.roles, right.roles)
    && sameMemberships(left.memberships, right.memberships)
    && shallowEqualObjects(left.profile, right.profile)
    && shallowEqualObjects(left.clinic, right.clinic);
}

function normalizeRole(value?: string | null) {
  return value && VALID_ROLES.includes(value) ? value : null;
}

function resolvePrimaryRole(profile: any, userRoles: string[]) {
  if (profile?.is_super_admin || profile?.role === "super_admin") return "super_admin";
  const profileRole = normalizeRole(profile?.role);
  if (profileRole) return profileRole;
  return userRoles.find((nextRole) => normalizeRole(nextRole)) || null;
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

  userRolesRows.forEach((row) => upsert(row.clinic_id, row.role, "user_roles"));
  clinicUsersRows.forEach((row) => upsert(row.clinic_id, row.role, "clinic_users"));

  return Array.from(membershipMap.values());
}

const AccessContext = createContext<any>(null);
const AccessAuthContext = createContext<any>(null);
const AccessClinicContext = createContext<any>(null);
const AccessRoleContext = createContext<any>(null);
const AccessActionsContext = createContext<any>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(() =>
    safeSupabaseStorage.getItem(ACTIVE_CLINIC_KEY),
  );
  const [accessState, setAccessState] = useState<AccessState>(() => createEmptyAccessState(false));

  const requestRef = useRef(0);
  const activeClinicIdRef = useRef(activeClinicId);
  const userRef = useRef(user);
  const accessStateRef = useRef(accessState);
  const accessReadyRef = useRef(accessState.accessReady);
  const completedLoadKeyRef = useRef<string | null>(null);
  const inFlightLoadRef = useRef<{ key: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    activeClinicIdRef.current = activeClinicId;
  }, [activeClinicId]);

  useEffect(() => {
    accessStateRef.current = accessState;
    accessReadyRef.current = accessState.accessReady;
  }, [accessState]);

  const persistActive = useCallback((clinicId: string | null) => {
    if (clinicId) safeSupabaseStorage.setItem(ACTIVE_CLINIC_KEY, clinicId);
    else safeSupabaseStorage.removeItem(ACTIVE_CLINIC_KEY);
  }, []);

  const invalidatePendingLoads = useCallback(() => {
    requestRef.current += 1;
    completedLoadKeyRef.current = null;
    inFlightLoadRef.current = null;
  }, []);

  const commitAccessState = useCallback((nextState: AccessState) => {
    setAccessState((prev) => (sameAccessState(prev, nextState) ? prev : nextState));
  }, []);

  const clearAccessState = useCallback((ready = true) => {
    invalidatePendingLoads();
    const nextState = createEmptyAccessState(ready);
    commitAccessState(nextState);
  }, [commitAccessState, invalidatePendingLoads]);

  const loadAccess = useCallback(async (
    nextUser: User | null,
    overrideClinicId: string | null,
    options?: { force?: boolean; blocking?: boolean; reason?: string },
  ) => {
    const force = options?.force ?? false;
    const blocking = options?.blocking ?? true;
    const reason = options?.reason ?? "manual";
    const loadKey = nextUser ? `${nextUser.id}:${overrideClinicId ?? ""}` : "anonymous";

    if (!nextUser) {
      invalidatePendingLoads();
      completedLoadKeyRef.current = loadKey;
      commitAccessState(createEmptyAccessState(true));
      return;
    }

    if (!force) {
      if (completedLoadKeyRef.current === loadKey) {
        console.debug("[access:load:skip]", { reason, loadKey });
        return;
      }
      if (inFlightLoadRef.current?.key === loadKey) {
        console.debug("[access:load:join]", { reason, loadKey });
        return inFlightLoadRef.current.promise;
      }
    }

    const promise = (async () => {
      const requestId = ++requestRef.current;
      const loadStartedAt = performance.now();
      completedLoadKeyRef.current = null;

      if (blocking) {
        setAccessState((prev) => (
          prev.accessReady || prev.profileError || prev.clinicResolutionFailed
            ? {
                ...prev,
                accessReady: false,
                profileError: null,
                clinicResolutionFailed: false,
              }
            : prev
        ));
      } else {
        setAccessState((prev) => (
          prev.profileError
            ? { ...prev, profileError: null }
            : prev
        ));
      }

      console.debug("[access:load:start]", {
        reason,
        user_id: nextUser.id,
        override_clinic_id: overrideClinicId,
        blocking,
        force,
      });

      try {
        const stage1Start = performance.now();

        const [profileResult, userRolesResult, clinicUsersResult] = await Promise.all([
          console.debug("[access:stage1_complete]", {
  durationMs: performance.now() - stage1Start,
  user_id: nextUser.id,
});
          apiClient.from("profiles").select("*").eq("id", nextUser.id).maybeSingle(),
          apiClient.from("user_roles").select("role, clinic_id").eq("user_id", nextUser.id),
          apiClient.from("clinic_users").select("role, clinic_id").eq("user_id", nextUser.id),
        ]);

        if (requestRef.current !== requestId) return;

        const nextProfile = profileResult.data || null;
        const userRolesRows = (userRolesResult.data || []) as Array<{ role: string; clinic_id: string | null }>;
        const clinicUsersRows = (clinicUsersResult.data || []) as Array<{ role: string | null; clinic_id: string | null }>;
        const fallbackRoles = Array.from(new Set([
          ...userRolesRows.map((row) => normalizeRole(row.role)),
          ...clinicUsersRows.map((row) => normalizeRole(row.role)),
        ].filter(Boolean))) as string[];
        const primaryRole = resolvePrimaryRole(nextProfile, fallbackRoles);
        const nextRoles = sortRoles(Array.from(new Set([primaryRole, ...fallbackRoles].filter(Boolean))) as string[]);

        const membershipClinicIds = Array.from(new Set([
          ...userRolesRows.map((row) => row.clinic_id),
          ...clinicUsersRows.map((row) => row.clinic_id),
        ].filter(Boolean) as string[]));

        let membershipRows: MembershipRow[] = [];
        if (membershipClinicIds.length > 0) {
          const membershipsStart = performance.now();
          const { data: clinicsData } = await apiClient
            .from("clinics")
            .select("id, name, setup_completed")
            .in("id", membershipClinicIds);

          if (requestRef.current !== requestId) return;

          const clinicMap = new Map((clinicsData || []).map((clinicRow: any) => [clinicRow.id, clinicRow]));
          membershipRows = sortMemberships(mergeMemberships({ userRolesRows, clinicUsersRows, clinicMap }));
        }

        const nextAccessState: AccessState = {
          accessReady: true,
          profile: nextProfile,
          clinic: null,
          roles: nextRoles,
          role: primaryRole,
          profileError: profileResult.error || null,
          memberships: membershipRows,
          resolvedClinicId: null,
          clinicResolutionFailed: false,
        };

        const isSuperAdminUser = primaryRole === "super_admin" || nextProfile?.is_super_admin === true;

        if (isSuperAdminUser) {
          if (overrideClinicId) {
            try {
              const { data } = await apiClient
                .from("clinics")
                .select("id, name, subscription_status, setup_completed, onboarding_step, is_active, lifecycle_status, logo_url")
                .eq("id", overrideClinicId)
                .maybeSingle();
              nextAccessState.clinic = data || null;
            } catch (error: any) {
              console.warn("[access:super_admin_clinic_override_failed]", { message: error?.message });
            }
          }

          if (requestRef.current !== requestId) return;

          commitAccessState(nextAccessState);
          completedLoadKeyRef.current = loadKey;
          console.debug("[access:super_admin_ready]", {
            reason,
            user_id: nextUser.id,
            override_clinic_id: overrideClinicId,
          });
          return;
        }

        const resolveClinicStart = performance.now();

        const { data: resolvedRow, error: resolvedError } = await apiClient
          .from("user_active_clinic")
          .select("resolved_clinic_id, is_super_admin")
          .eq("id", nextUser.id)
          .maybeSingle();

        if (requestRef.current !== requestId) return;
        if (resolvedError) throw resolvedError;

        const backendResolvedClinicId = (resolvedRow as any)?.resolved_clinic_id ?? null;
        nextAccessState.resolvedClinicId = backendResolvedClinicId;

        if (overrideClinicId && overrideClinicId !== backendResolvedClinicId) {
          persistActive(null);
          setActiveClinicIdState((prev) => (prev === null ? prev : null));
        }

        if (!backendResolvedClinicId) {
          nextAccessState.clinicResolutionFailed = true;
          commitAccessState(nextAccessState);
          completedLoadKeyRef.current = loadKey;
          console.debug("[access:no_clinic]", { reason, user_id: nextUser.id });
          return;
        }

        const clinicFetchStart = performance.now();

        const clinicResult = await apiClient
          .from("clinics")
          .select("id, name, subscription_status, setup_completed, onboarding_step, is_active, lifecycle_status, logo_url")
          .eq("id", backendResolvedClinicId)
          .maybeSingle();

        if (requestRef.current !== requestId) return;

        nextAccessState.clinic = clinicResult.data || null;
        commitAccessState(nextAccessState);
        completedLoadKeyRef.current = loadKey;

        console.debug("[access:ready]", {
          reason,
          user_id: nextUser.id,
          role: primaryRole,
          clinic_id: backendResolvedClinicId,
        });
      } catch (error: any) {
        if (requestRef.current !== requestId) return;

        setAccessState((prev) => {
          const nextState = {
            ...prev,
            accessReady: true,
            profileError: error,
            clinicResolutionFailed: true,
          };
          return sameAccessState(prev, nextState) ? prev : nextState;
        });

        console.error("[access:error]", {
          reason,
          user_id: nextUser.id,
          message: error?.message,
        });
      }
    })();

    inFlightLoadRef.current = { key: loadKey, promise };

    try {
      await promise;
    } finally {
      if (inFlightLoadRef.current?.key === loadKey) {
        inFlightLoadRef.current = null;
      }
    }
  }, [commitAccessState, invalidatePendingLoads, persistActive]);

  useEffect(() => {
    let mounted = true;

    const applySession = async (session: Session | null, reason: string) => {
      if (!mounted) return;

      const nextUser = session?.user ?? null;
      const previousUserId = userRef.current?.id ?? null;
      const nextUserId = nextUser?.id ?? null;
      const userChanged = previousUserId !== nextUserId;

      setKnownSupabaseSession(session);
      userRef.current = nextUser;
      setUser(nextUser);

      console.debug("[auth:session]", {
        reason,
        previous_user_id: previousUserId,
        next_user_id: nextUserId,
        has_session: !!session,
      });

      if (!nextUser) {
        clearAccessState(true);
        setAuthLoading(false);
        console.debug("[auth:init:end]", { reason, has_session: false, user_id: null });
        return;
      }

      const shouldHydrateAccess = userChanged || !accessReadyRef.current;
      if (shouldHydrateAccess) {
        await loadAccess(nextUser, activeClinicIdRef.current, {
          force: userChanged,
          blocking: userChanged || !accessReadyRef.current,
          reason,
        });
      } else {
        console.debug("[access:load:skip:auth_event]", {
          reason,
          user_id: nextUser.id,
          loadKey: `${nextUser.id}:${activeClinicIdRef.current ?? ""}`,
        });
      }

      if (!mounted) return;
      setAuthLoading(false);
      console.debug("[auth:init:end]", { reason, has_session: true, user_id: nextUserId });
    };

    console.debug("[auth:init:start]");

    const { data: { subscription } } = apiClient.auth.onAuthStateChange((event, session) => {
      console.debug("[auth:event]", event, {
        user_id: session?.user?.id ?? null,
        has_session: !!session,
      });

      if (event === "INITIAL_SESSION") return;

      if (event === "TOKEN_REFRESHED") {
        setKnownSupabaseSession(session ?? null);
        console.debug("[auth:refresh]", {
          user_id: session?.user?.id ?? null,
          refreshed: !!session?.access_token,
        });
        return;
      }

      if (event === "USER_UPDATED") {
        setKnownSupabaseSession(session ?? null);
        if (session?.user) {
          setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        invalidatePendingLoads();
        persistActive(null);
        setActiveClinicIdState((prev) => (prev === null ? prev : null));
        setKnownSupabaseSession(null);
        setUser((prev) => (prev === null ? prev : null));
        commitAccessState(createEmptyAccessState(true));
        setAuthLoading(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        if (session?.user?.id && userRef.current?.id === session.user.id && accessReadyRef.current) {
          setKnownSupabaseSession(session);
          setAuthLoading(false);
          console.debug("[auth:event:skip_duplicate]", {
            event,
            user_id: session.user.id,
          });
          return;
        }
        void applySession(session, event);
      }
    });

    (async () => {
      try {
        const { data } = await apiClient.auth.getSession();
        console.debug("[auth:getSession]", {
          has_session: !!data.session,
          user_id: data.session?.user?.id ?? null,
        });
        await applySession(data.session ?? null, "bootstrap");
      } catch (error: any) {
        console.error("[auth:bootstrap:error]", { message: error?.message });
        if (!mounted) return;
        setKnownSupabaseSession(null);
        setUser((prev) => (prev === null ? prev : null));
        clearAccessState(true);
        setAuthLoading(false);
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [clearAccessState, commitAccessState, invalidatePendingLoads, loadAccess, persistActive]);

  const reload = useCallback(() => {
    return loadAccess(userRef.current, activeClinicIdRef.current, {
      force: true,
      blocking: false,
      reason: "reload",
    });
  }, [loadAccess]);

  const switchClinic = useCallback(async (clinicId: string | null) => {
    const currentState = accessStateRef.current;
    const isSuperAdminUser = currentState.role === "super_admin" || currentState.profile?.is_super_admin === true;
    const currentEffectiveClinicId = isSuperAdminUser
      ? (activeClinicIdRef.current || currentState.resolvedClinicId || null)
      : currentState.resolvedClinicId;

    if (clinicId === currentEffectiveClinicId) {
      console.debug("[access:switch:skip]", { clinic_id: clinicId });
      return true;
    }

    if (clinicId && userRef.current) {
      const grantedRole = await assertClinicAccess(apiClient as any, userRef.current.id, clinicId);
      if (!grantedRole) {
        throw new Error("You do not have access to this clinic.");
      }
    }

    persistActive(clinicId);
    setActiveClinicIdState((prev) => (prev === clinicId ? prev : clinicId));

    await loadAccess(userRef.current, clinicId, {
      force: true,
      blocking: true,
      reason: "switchClinic",
    });

    return true;
  }, [loadAccess, persistActive]);

  const signOut = useCallback(async () => {
    persistActive(null);
    setActiveClinicIdState((prev) => (prev === null ? prev : null));
    try { sessionStorage.removeItem("optocare:clinic-identity"); } catch { /* ignore */ }
    await apiClient.auth.signOut();
  }, [persistActive]);

  const isAuthenticated = !!user;
  const isAuthReady = !authLoading && (!isAuthenticated || accessState.accessReady);
  const isSuperAdminUser = accessState.role === "super_admin" || accessState.profile?.is_super_admin === true;
  const roleMissing = isAuthenticated && isAuthReady && !accessState.role && !isSuperAdminUser;
  const effectiveClinicId = isSuperAdminUser
    ? (activeClinicId || accessState.resolvedClinicId || null)
    : accessState.resolvedClinicId;

  const authValue = useMemo(() => ({
    user,
    authLoading,
    isAuthenticated,
    isAuthReady,
  }), [authLoading, isAuthenticated, isAuthReady, user]);

  const clinicValue = useMemo(() => ({
    profile: accessState.profile,
    profileError: accessState.profileError,
    clinic: accessState.clinic,
    memberships: accessState.memberships,
    profileLoading:
  isAuthenticated &&
  (!accessState.accessReady || !accessState.profile),

clinicLoading:
  isAuthenticated &&
  (
    !accessState.accessReady ||
    (
      !!effectiveClinicId &&
      !accessState.clinic &&
      !accessState.clinicResolutionFailed
    )
  ),

membershipLoading:
  isAuthenticated &&
  !accessState.accessReady,
    accessReady: accessState.accessReady,
    activeClinicId,
    effectiveClinicId,
    resolvedClinicId: accessState.resolvedClinicId,
    clinicResolutionFailed: accessState.clinicResolutionFailed,
  }), [accessState.accessReady, accessState.clinic, accessState.clinicResolutionFailed, accessState.memberships, accessState.profile, accessState.profileError, accessState.resolvedClinicId, activeClinicId, effectiveClinicId, isAuthenticated]);

  const roleValue = useMemo(() => ({
    roles: accessState.roles,
    role: accessState.role,
    roleLoading: !accessState.accessReady && isAuthenticated,
    roleMissing,
  }), [accessState.accessReady, accessState.role, accessState.roles, isAuthenticated, roleMissing]);

  const actionsValue = useMemo(() => ({
    switchClinic,
    reload,
    signOut,
  }), [reload, signOut, switchClinic]);

  const value = useMemo(() => ({
    ...authValue,
    ...clinicValue,
    ...roleValue,
    ...actionsValue,
  }), [actionsValue, authValue, clinicValue, roleValue]);

  return (
    <AccessAuthContext.Provider value={authValue}>
      <AccessClinicContext.Provider value={clinicValue}>
        <AccessRoleContext.Provider value={roleValue}>
          <AccessActionsContext.Provider value={actionsValue}>
            <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
          </AccessActionsContext.Provider>
        </AccessRoleContext.Provider>
      </AccessClinicContext.Provider>
    </AccessAuthContext.Provider>
  );
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}

export function useAccessAuth() {
  const ctx = useContext(AccessAuthContext);
  if (!ctx) throw new Error("useAccessAuth must be used within AccessProvider");
  return ctx;
}

export function useAccessClinic() {
  const ctx = useContext(AccessClinicContext);
  if (!ctx) throw new Error("useAccessClinic must be used within AccessProvider");
  return ctx;
}

export function useAccessRole() {
  const ctx = useContext(AccessRoleContext);
  if (!ctx) throw new Error("useAccessRole must be used within AccessProvider");
  return ctx;
}

export function useAccessActions() {
  const ctx = useContext(AccessActionsContext);
  if (!ctx) throw new Error("useAccessActions must be used within AccessProvider");
  return ctx;
}
