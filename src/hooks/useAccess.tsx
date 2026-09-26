import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { apiClient } from "@/lib/apiClient";
import { assertClinicAccess } from "@/lib/route-access";
import { checkClinicSubscription } from "@/lib/diag/healthChecks";
import { safeSupabaseStorage, setKnownSupabaseSession } from "@/lib/supabase-auth";
import { secureOfflineGet, secureOfflineSave, secureOfflineClearKey } from "@/lib/secureOfflineStore";
import { clearOfflineSession, getOfflineSession, getTrustedOfflineProfile, refreshOfflineAccessSnapshot } from "@/lib/offlineAuth";

const VALID_ROLES = ["super_admin", "admin", "doctor", "nurse", "receptionist"];
const ACTIVE_CLINIC_KEY = "active_clinic_id";
const ACCESS_QUERY_TIMEOUT_MS = 8000;

async function withAccessTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Access query timed out: ${label}`)), ACCESS_QUERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  const [isOfflineSession, setIsOfflineSession] = useState(false);
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

  const restoreOfflineSession = useCallback(async () => {
    const session = await getOfflineSession();
    if (!session) return false;
    const cached =
      (await secureOfflineGet<{ userId: string; state: AccessState }>(
        "access:" + session.userId + ":" + (session.clinicId || "default"),
      )) ||
      (await secureOfflineGet<{ userId: string; state: AccessState }>(
        "access:" + session.userId + ":default",
      ));
    // The trusted-device record contains its own access snapshot. Use it as
    // the authoritative fallback so offline login does not depend on a
    // separate localStorage cache having been populated.
    const trusted = await getTrustedOfflineProfile();
    const snapshotState = trusted?.userId === session.userId ? trusted.snapshot : null;
    const offlineState = cached?.state?.profile ? cached.state : snapshotState;
    if (!offlineState?.profile) {
      clearOfflineSession();
      return false;
    }

    // Older trusted-device snapshots could have been created before role
    // hydration finished. Recover the role/clinic from the snapshot itself
    // instead of allowing the route guard to report a missing role offline.
    const recoveredRole =
      offlineState.role ||
      offlineState.profile?.role ||
      offlineState.roles?.[0] ||
      offlineState.memberships?.[0]?.role ||
      null;
    const recoveredRoles = Array.from(new Set([
      ...(offlineState.roles || []),
      ...(offlineState.profile?.role ? [offlineState.profile.role] : []),
      ...(recoveredRole ? [recoveredRole] : []),
    ]));
    const recoveredClinicId =
      offlineState.resolvedClinicId ||
      offlineState.activeClinicId ||
      session.clinicId ||
      offlineState.clinic?.id ||
      offlineState.memberships?.[0]?.clinic_id ||
      null;
    const restoredAccessState: AccessState = {
      ...offlineState,
      role: recoveredRole,
      roles: recoveredRoles,
      resolvedClinicId: recoveredClinicId,
      activeClinicId: offlineState.activeClinicId || recoveredClinicId,
      accessReady: true,
      profileError: null,
      clinicResolutionFailed: false,
    };
    const offlineUser = {
      id: session.userId, aud: "authenticated", role: "authenticated",
      email: session.email ?? undefined, email_confirmed_at: null, phone: null,
      confirmed_at: null, last_sign_in_at: session.startedAt,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: session.displayName ?? undefined }, identities: [],
      created_at: session.startedAt, updated_at: session.startedAt, is_anonymous: false,
    } as unknown as User;
    setKnownSupabaseSession(null);
    userRef.current = offlineUser;
    setUser(offlineUser);
    setIsOfflineSession(true);
    commitAccessState(restoredAccessState);
    return true;
  }, [commitAccessState]);

  useEffect(() => {
    activeClinicIdRef.current = activeClinicId;
  }, [activeClinicId]);

  useEffect(() => {
    accessStateRef.current = accessState;
    accessReadyRef.current = accessState.accessReady;
  }, [accessState]);

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

    // Always keep a last-known-good access snapshot available, even when the
    // browser reports that it is online. A transient Supabase/RLS/network
    // failure must not turn a previously working session into "clinic loading".
    const cachedAccess =
      (await secureOfflineGet<{ userId: string; state: AccessState }>(
        "access:" + nextUser.id + ":" + (overrideClinicId || "default")
      )) ||
      (!overrideClinicId
        ? await secureOfflineGet<{ userId: string; state: AccessState }>(
            "access:" + nextUser.id + ":default"
          )
        : null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (cachedAccess?.userId === nextUser.id && cachedAccess.state?.profile) {
        commitAccessState({
          ...cachedAccess.state,
          accessReady: true,
          profileError: null,
          clinicResolutionFailed: false,
        });
        completedLoadKeyRef.current = loadKey;
        console.debug("[access:offline-cache]", {
          user_id: nextUser.id,
          clinic_id: cachedAccess.state.resolvedClinicId,
          override_clinic_id: overrideClinicId,
        });
        return;
      }
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

        const [profileSettled, userRolesSettled, clinicUsersSettled] = await Promise.allSettled([
          withAccessTimeout(
            apiClient
              .from("profiles")
              .select("id,role,is_super_admin")
              .eq("id", nextUser.id)
              .maybeSingle(),
            "profiles",
          ),
          withAccessTimeout(
            apiClient
              .from("user_roles")
              .select("role, clinic_id")
              .eq("user_id", nextUser.id),
            "user_roles",
          ),
          withAccessTimeout(
            apiClient
              .from("clinic_users")
              .select("role, clinic_id")
              .eq("user_id", nextUser.id),
            "clinic_users",
          ),
        ]);

        const profileResult =
          profileSettled.status === "fulfilled"
            ? profileSettled.value
            : { data: null, error: profileSettled.reason };

        const userRolesResult =
          userRolesSettled.status === "fulfilled"
            ? userRolesSettled.value
            : { data: [], error: userRolesSettled.reason };

        const clinicUsersResult =
          clinicUsersSettled.status === "fulfilled"
            ? clinicUsersSettled.value
            : { data: [], error: clinicUsersSettled.reason };

        if (profileSettled.status === "rejected") {
          console.warn("[access:profile_timeout]", { message: profileSettled.reason?.message });
        }
        if (userRolesSettled.status === "rejected") {
          console.warn("[access:user_roles_timeout]", { message: userRolesSettled.reason?.message });
        }
        if (clinicUsersSettled.status === "rejected") {
          console.warn("[access:clinic_users_timeout]", { message: clinicUsersSettled.reason?.message });
        }

console.debug("[access:stage1_complete]", {
  durationMs: performance.now() - stage1Start,
  user_id: nextUser.id,
});

        if (requestRef.current !== requestId) return;

        const nextProfile = profileResult.data || null;
        let userRolesRows = (userRolesResult.data || []) as Array<{ role: string; clinic_id: string | null }>;
        let clinicUsersRows = (clinicUsersResult.data || []) as Array<{ role: string | null; clinic_id: string | null }>;

        // A freshly authenticated browser can briefly have a valid Supabase
        // session while the first PostgREST request is made without the
        // expected JWT context. Supabase documents that RLS can then return an
        // empty data array rather than an error. Do one bounded auth check and
        // membership retry before treating an empty result as "no clinic".
        if (userRolesRows.length === 0 && clinicUsersRows.length === 0) {
          let authHealthy = false;
          try {
            const { data: verified, error: verifyError } = await apiClient.auth.getUser();
            if (!verifyError && verified.user?.id === nextUser.id) {
              authHealthy = true;
            } else {
              const { data: refreshed, error: refreshError } = await apiClient.auth.refreshSession();
              if (!refreshError && refreshed.session?.user?.id === nextUser.id) {
                authHealthy = true;
              }
            }
          } catch (error: any) {
            console.warn("[access:auth-recovery_failed]", {
              user_id: nextUser.id,
              message: error?.message,
            });
          }

          if (authHealthy) {
            await new Promise((resolve) => window.setTimeout(resolve, 250));

            const [retryUserRoles, retryClinicUsers] = await Promise.allSettled([
              withAccessTimeout(
                apiClient
                  .from("user_roles")
                  .select("role, clinic_id")
                  .eq("user_id", nextUser.id),
                "user_roles retry",
              ),
              withAccessTimeout(
                apiClient
                  .from("clinic_users")
                  .select("role, clinic_id")
                  .eq("user_id", nextUser.id),
                "clinic_users retry",
              ),
            ]);

            if (retryUserRoles.status === "fulfilled" && retryUserRoles.value.data?.length) {
              userRolesRows = retryUserRoles.value.data as Array<{ role: string; clinic_id: string | null }>;
            }
            if (retryClinicUsers.status === "fulfilled" && retryClinicUsers.value.data?.length) {
              clinicUsersRows = retryClinicUsers.value.data as Array<{ role: string | null; clinic_id: string | null }>;
            }

            console.debug("[access:membership_retry]", {
              user_id: nextUser.id,
              user_roles: userRolesRows.length,
              clinic_users: clinicUsersRows.length,
            });
          }
        }
        const fallbackRoles = Array.from(new Set([
          ...userRolesRows.map((row) => normalizeRole(row.role)),
          ...clinicUsersRows.map((row) => normalizeRole(row.role)),
        ].filter(Boolean))) as string[];
        let primaryRole = resolvePrimaryRole(nextProfile, fallbackRoles);
        let nextRoles = sortRoles(Array.from(new Set([primaryRole, ...fallbackRoles].filter(Boolean))) as string[]);

        // If online access queries temporarily return no role/memberships,
        // recover from the last successful snapshot before the route guard
        // reports a false "clinic is loading" error.
        if (!primaryRole && cachedAccess?.userId === nextUser.id && cachedAccess.state?.profile) {
          const cachedState = cachedAccess.state;
          primaryRole =
            cachedState.role ||
            cachedState.profile?.role ||
            cachedState.roles?.[0] ||
            cachedState.memberships?.[0]?.role ||
            null;
          nextRoles = sortRoles(Array.from(new Set([
            ...cachedState.roles,
            ...(primaryRole ? [primaryRole] : []),
          ].filter(Boolean))) as string[]);
          console.warn("[access:last-known-good-role]", {
            reason,
            user_id: nextUser.id,
            clinic_id: cachedState.resolvedClinicId,
          });
        }

        const membershipClinicIds = Array.from(new Set([
          ...userRolesRows.map((row) => row.clinic_id),
          ...clinicUsersRows.map((row) => row.clinic_id),
        ].filter(Boolean) as string[]));

        let membershipRows: MembershipRow[] = [];
        if (membershipClinicIds.length > 0) {
          const membershipsStart = performance.now();
          
          let clinicsData: any[] | null = null;
          try {
            const membershipResult = await withAccessTimeout(
              apiClient
                .from("clinics")
                .select("id, name, setup_completed")
                .in("id", membershipClinicIds),
              "clinic membership details",
            );
            clinicsData = membershipResult.data || null;
          } catch (error: any) {
            console.warn("[access:memberships_timeout]", { message: error?.message });
          }

          console.debug("[access:memberships_complete]", {
  durationMs: performance.now() - membershipsStart,
  clinic_count: membershipClinicIds.length,
  returned: clinicsData?.length ?? 0,
});

          if (requestRef.current !== requestId) return;

          const clinicMap = new Map((clinicsData || []).map((clinicRow: any) => [clinicRow.id, clinicRow]));
          membershipRows = sortMemberships(mergeMemberships({ userRolesRows, clinicUsersRows, clinicMap }));
        }

        // Last-known-good access is authoritative for recovery when the
        // authenticated user is valid but the membership queries temporarily
        // return no rows. Never turn a transient access lookup failure into a
        // false "No clinic access" state.
        if (membershipRows.length === 0 && cachedAccess?.userId === nextUser.id && cachedAccess.state?.memberships?.length) {
          membershipRows = sortMemberships(cachedAccess.state.memberships);
          if (!primaryRole) {
            primaryRole =
              cachedAccess.state.role ||
              cachedAccess.state.profile?.role ||
              cachedAccess.state.roles?.[0] ||
              cachedAccess.state.memberships?.[0]?.role ||
              null;
            nextRoles = sortRoles(Array.from(new Set([
              ...cachedAccess.state.roles,
              ...(primaryRole ? [primaryRole] : []),
            ].filter(Boolean))) as string[]);
          }
          console.warn("[access:preserve_cached_membership]", {
            reason,
            user_id: nextUser.id,
            clinic_id: cachedAccess.state.resolvedClinicId,
            membership_count: membershipRows.length,
          });
        }

        let nextAccessState: AccessState = {
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

        // A background/network refresh must never erase a previously verified
        // role or clinic membership just because one of the access queries
        // temporarily failed or returned no rows. Preserve the last known-good
        // access state and let a later successful refresh replace it.
        const previousAccess = accessStateRef.current;
        const accessLookupHadError =
          !!profileResult.error ||
          !!userRolesResult.error ||
          !!clinicUsersResult.error ||
          profileSettled.status === "rejected" ||
          userRolesSettled.status === "rejected" ||
          clinicUsersSettled.status === "rejected";

        if (
          previousAccess.accessReady &&
          previousAccess.role &&
          (!nextAccessState.role || nextAccessState.roles.length === 0)
        ) {
          nextAccessState = {
            ...previousAccess,
            accessReady: true,
            profileError: profileResult.error || previousAccess.profileError || null,
            clinicResolutionFailed: false,
          };
          completedLoadKeyRef.current = loadKey;
          console.warn("[access:preserve_last_known_good]", {
            reason,
            user_id: nextUser.id,
            role: previousAccess.role,
            clinic_id: previousAccess.resolvedClinicId,
          });
          return;
        }

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

              if (data) {
  checkClinicSubscription(
    data.subscription_status
  );
              }
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

        let resolvedRow: { resolved_clinic_id: string | null; is_super_admin: boolean | null } | null = null;
        let resolvedError: any = null;
        try {
          const result = await withAccessTimeout(
            apiClient
              .from("user_active_clinic")
              .select("resolved_clinic_id, is_super_admin")
              .eq("id", nextUser.id)
              .maybeSingle(),
            "user_active_clinic",
          );
          resolvedRow = result.data as typeof resolvedRow;
          resolvedError = result.error;
        } catch (error) {
          resolvedError = error;
          console.warn("[access:resolve_clinic_timeout]", { message: (error as any)?.message });
        }

        if (requestRef.current !== requestId) return;
        console.debug("[access:resolve_clinic_complete]", {
  durationMs: performance.now() - resolveClinicStart,
  resolved_clinic_id: (resolvedRow as any)?.resolved_clinic_id ?? null,
});

        let backendResolvedClinicId = (resolvedRow as any)?.resolved_clinic_id ?? null;

        // A resolved clinic is only trusted when it is also present in the
        // verified membership set. This prevents a stale/incorrect active
        // clinic view from producing either the wrong tenant or a false access
        // state.
        if (
          backendResolvedClinicId &&
          membershipRows.length > 0 &&
          !membershipRows.some((row) => row.clinic_id === backendResolvedClinicId)
        ) {
          console.warn("[access:reject_unverified_clinic]", {
            user_id: nextUser.id,
            clinic_id: backendResolvedClinicId,
          });
          backendResolvedClinicId = null;
        }

        // Membership rows are already read through tenant-scoped RLS policies.
        // Use them as the authoritative client-side fallback if the
        // security-invoker active-clinic view is unavailable or returns no row.
        // Prefer the explicitly selected clinic when it is one of the user's
        // verified memberships; otherwise use the first verified membership.
        if (!backendResolvedClinicId && cachedAccess?.userId === nextUser.id && cachedAccess.state?.resolvedClinicId) {
          const cachedClinicId = cachedAccess.state.resolvedClinicId;
          if (membershipRows.some((row) => row.clinic_id === cachedClinicId)) {
            backendResolvedClinicId = cachedClinicId;
            console.warn("[access:resolve_clinic_cached_fallback]", {
              user_id: nextUser.id,
              clinic_id: backendResolvedClinicId,
              reason,
            });
          }
        }

        if (!backendResolvedClinicId && membershipRows.length > 0) {
          const preferredMembership =
            (overrideClinicId && membershipRows.find((row) => row.clinic_id === overrideClinicId)) ||
            membershipRows[0];

          backendResolvedClinicId = preferredMembership?.clinic_id ?? null;

          if (backendResolvedClinicId) {
            console.warn("[access:resolve_clinic_membership_fallback]", {
              user_id: nextUser.id,
              clinic_id: backendResolvedClinicId,
              membership_count: membershipRows.length,
              reason: resolvedError?.message || "active clinic view returned no clinic",
            });
          }
        }

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

        let clinicResult: any = { data: null, error: null };
        try {
          clinicResult = await withAccessTimeout(
            apiClient
              .from("clinics")
              .select(
                "id, name, subscription_status, setup_completed, onboarding_step, is_active, lifecycle_status, logo_url"
              )
              .eq("id", backendResolvedClinicId)
              .maybeSingle(),
            "active clinic details",
          );
        } catch (error: any) {
          clinicResult = { data: null, error };
          console.warn("[access:clinic_fetch_timeout]", { message: error?.message });
        }

        console.debug("[access:clinic_fetch_complete]", {
  durationMs: performance.now() - clinicFetchStart,
  clinic_id: backendResolvedClinicId,
  returned: !!clinicResult.data,
});

        if (requestRef.current !== requestId) return;

        nextAccessState.clinic = clinicResult.data || null;
        nextAccessState.clinicResolutionFailed = false;
        commitAccessState(nextAccessState);

        if (clinicResult.data) {
  checkClinicSubscription(
    clinicResult.data.subscription_status
  );
}

commitAccessState(nextAccessState);
await secureOfflineSave(
  "access:" + nextUser.id + ":" + (overrideClinicId || "default"),
  { userId: nextUser.id, state: nextAccessState }
);
// Keep the trusted-device snapshot synchronized after a successful online
// access load so a later cold-start offline login has the current role/clinic.
void refreshOfflineAccessSnapshot({
  profile: nextAccessState.profile,
  clinic: nextAccessState.clinic,
  memberships: nextAccessState.memberships,
  roles: nextAccessState.roles,
  role: nextAccessState.role,
  resolvedClinicId: nextAccessState.resolvedClinicId,
  activeClinicId: overrideClinicId || nextAccessState.resolvedClinicId,
}).catch(() => {});
completedLoadKeyRef.current = loadKey;

        console.debug("[access:load:total]", {
  durationMs: performance.now() - loadStartedAt,
  user_id: nextUser.id,
});

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
        setIsOfflineSession(false);
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
        setIsOfflineSession(false);
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
        setIsOfflineSession(false);
        setUser((prev) => (prev === null ? prev : null));
        commitAccessState(createEmptyAccessState(true));
        setAuthLoading(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        setIsOfflineSession(false);
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
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const restored = await restoreOfflineSession();
          if (restored) {
            if (!mounted) return;
            setAuthLoading(false);
            console.debug("[auth:offline] restored trusted-device session");
            return;
          }
        }
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
  }, [clearAccessState, commitAccessState, invalidatePendingLoads, loadAccess, persistActive, restoreOfflineSession]);

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

    // Super admins are platform-level users and may enter any clinic.
    // Do not require a clinic membership row for them; that defeats the
    // purpose of the Super Admin Clinics "Enter Clinic" action.
    if (clinicId && userRef.current && !isSuperAdminUser) {
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

  const clearOfflineUserCache = useCallback((userId: string | null) => {
    if (!userId) return;
    const prefixes = [
      "access:" + userId + ":",
    ];
    try {
      const keysToRemove: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && prefixes.some((prefix) => key.startsWith("optocare:offline:" + prefix))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignore local storage cleanup failures.
    }
  }, []);

  const signOut = useCallback(async () => {
    const currentUserId = userRef.current?.id ?? null;
    persistActive(null);
    setActiveClinicIdState((prev) => (prev === null ? prev : null));
    clearOfflineUserCache(currentUserId);
    await secureOfflineClearKey();
    try { sessionStorage.removeItem("optocare:clinic-identity"); } catch { /* ignore */ }
    if (isOfflineSession) {
      clearOfflineSession();
      setIsOfflineSession(false);
      setUser(null);
      clearAccessState(true);
      return;
    }
    await apiClient.auth.signOut();
  }, [clearOfflineUserCache, persistActive, isOfflineSession, clearAccessState]);

  const isAuthenticated = !!user;
  const isAuthReady = !authLoading && (!isAuthenticated || accessState.accessReady);
  const isSuperAdminUser = accessState.role === "super_admin" || accessState.profile?.is_super_admin === true;

  // Do not convert a transient access-hydration gap into a fatal route error.
  // PatientRecord can trigger several background requests (visits, dispensing,
  // feedback, staff) and an auth refresh/network hiccup must never make the
  // whole application report that the user's role disappeared.
  const roleMissing =
    isAuthenticated &&
    isAuthReady &&
    !accessState.role &&
    accessState.roles.length === 0 &&
    !isSuperAdminUser &&
    !accessState.profile?.role &&
    accessState.memberships.length === 0;
  const effectiveClinicId = isSuperAdminUser
    ? (activeClinicId || accessState.resolvedClinicId || null)
    : accessState.resolvedClinicId;

  const authValue = useMemo(() => ({
    user,
    authLoading,
    isOfflineSession,
    isAuthenticated,
    isAuthReady,
  }), [authLoading, isAuthenticated, isAuthReady, isOfflineSession, user]);
