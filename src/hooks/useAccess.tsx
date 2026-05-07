import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const VALID_ROLES = ["super_admin", "admin", "doctor", "nurse", "receptionist"];

function normalizeRole(value?: string | null) {
  return value && VALID_ROLES.includes(value) ? value : null;
}

function resolvePrimaryRole(profile: any, userRoles: string[]) {
  if (profile?.is_super_admin || profile?.role === "super_admin") {
    return "super_admin";
  }

  const profileRole = normalizeRole(profile?.role);
  if (profileRole) {
    return profileRole;
  }

  return userRoles.find((role) => normalizeRole(role)) || null;
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
  const requestRef = useRef(0);

  const loadAccess = useCallback(async (nextUser = user) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (!nextUser) {
      setProfile(null);
      setClinic(null);
      setRoles([]);
      setRole(null);
      setProfileLoading(false);
      setRoleLoading(false);
      setClinicLoading(false);
      return;
    }

    setProfileLoading(true);
    setRoleLoading(true);
    setClinicLoading(true);

    const [profileResult, userRolesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role, clinic_id, is_super_admin, title")
        .eq("id", nextUser.id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", nextUser.id),
    ]);

    if (requestRef.current !== requestId) {
      return;
    }

    const nextProfile = profileResult.data || null;
    const fallbackRoles = (userRolesResult.data || [])
      .map((item: any) => normalizeRole(item.role))
      .filter(Boolean);
    const primaryRole = resolvePrimaryRole(nextProfile, fallbackRoles);
    const nextRoles = Array.from(new Set([primaryRole, ...fallbackRoles].filter(Boolean))) as string[];

    setProfile(nextProfile);
    setRoles(nextRoles);
    setRole(primaryRole);
    setProfileLoading(false);
    setRoleLoading(false);

    if (!nextProfile?.clinic_id) {
      setClinic(null);
      setClinicLoading(false);
      return;
    }

    const clinicResult = await supabase
      .from("clinics")
      .select("id, name, subscription_status, trial_start_date, trial_end_date, setup_completed, onboarding_step, is_active")
      .eq("id", nextProfile.clinic_id)
      .maybeSingle();

    if (requestRef.current !== requestId) {
      return;
    }

    setClinic(clinicResult.data || null);
    setClinicLoading(false);
  }, [user]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) {
        return;
      }

      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadAccess(user);
  }, [authLoading, user, loadAccess]);

  const isAuthenticated = Boolean(user);
  const isAuthReady = !authLoading && (!isAuthenticated || (!profileLoading && !roleLoading && !clinicLoading));
  const roleMissing = isAuthenticated && isAuthReady && !role;

  const value = useMemo(() => ({
    user,
    authLoading,
    profile,
    clinic,
    roles,
    role,
    profileLoading,
    roleLoading,
    clinicLoading,
    isAuthenticated,
    isAuthReady,
    roleMissing,
    reload: () => loadAccess(user),
    signOut: () => supabase.auth.signOut(),
  }), [authLoading, clinic, clinicLoading, isAuthenticated, isAuthReady, loadAccess, profile, profileLoading, role, roleLoading, roleMissing, roles, user]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const context = useContext(AccessContext);

  if (!context) {
    throw new Error("useAccess must be used within AccessProvider");
  }

  return context;
}