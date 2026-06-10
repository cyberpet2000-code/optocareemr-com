export const ACCESS_TIMEOUT_MS = 5000;

type ProtectedRouteInput = {
  path: string;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  didTimeout: boolean;
  role: string | null;
  clinicId: string | null | undefined;
  setupCompleted: boolean | null | undefined;
  roleMissing: boolean;
  membershipsCount?: number;
  lifecycleStatus?: string | null;
  isActive?: boolean;
};

const BILLING_ALLOWED_PATHS = ["/billing", "/no-access", "/select-clinic"];

type RouteDecision =
  | { type: "allow" }
  | { type: "loading"; label: string }
  | { type: "error"; label: string }
  | { type: "redirect"; to: string };

export function resolveDefaultRoute({
  role,
  clinicId,
  setupCompleted,
  membershipsCount = 0,
}: {
  role: string | null;
  clinicId: string | null | undefined;
  setupCompleted: boolean | null | undefined;
  membershipsCount?: number;
}) {
  if (role === "super_admin") {
    // STRICT: super_admin never auto-enters a clinic
    return "/super-admin";
  }
  if (clinicId) {
    if (setupCompleted === false) return "/onboarding";
    return "/dashboard";
  }
  if (membershipsCount > 0) return "/select-clinic";
  return "/no-access";
}

/**
 * Single source of truth for clinic access.
 * Returns the role string if the user has a user_roles record for the given clinic, otherwise null.
 * MUST be used everywhere clinic access is required.
 */
export async function assertClinicAccess(
  supabase: { from: (t: string) => any },
  userId: string,
  clinicId: string
): Promise<string | null> {
  if (!userId || !clinicId) return null;
  // Super admin bypass: any super_admin can enter any clinic.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (profile && (profile.is_super_admin || profile.role === "super_admin")) {
    return "super_admin";
  }
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!error && data) {
    return (data as { role: string }).role ?? null;
  }

  const { data: clinicMembership, error: clinicMembershipError } = await supabase
    .from("clinic_users")
    .select("role")
    .eq("user_id", userId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (clinicMembershipError || !clinicMembership) return null;
  return (clinicMembership as { role: string }).role ?? null;
}

export function resolveProtectedRoute(input: ProtectedRouteInput): RouteDecision {
  const {
    path,
    isAuthenticated,
    isAuthReady,
    didTimeout,
    role,
    clinicId,
    setupCompleted,
    roleMissing,
    membershipsCount = 0,
    lifecycleStatus,
    isActive = true,
  } = input;

  const isSuperAdmin = role === "super_admin";
  const hasActiveClinic = !!clinicId;

  // a. Loading state
  if (!isAuthReady && !didTimeout) {
    return { type: "loading", undefined };
  }

  // b. Auth failure
  if (!isAuthenticated || didTimeout) {
    return { type: "redirect", to: "/login" };
  }

  // Inactive staff (super admins bypass)
  if (!isSuperAdmin && isActive === false) {
    if (path === "/no-access") return { type: "allow" };
    return { type: "redirect", to: "/no-access" };
  }

  // d. Super admin short-circuit — bypasses clinic, onboarding, billing, lifecycle.
  if (isSuperAdmin) {
    if (path === "/") return { type: "redirect", to: "/super-admin" };
    if (path === "/onboarding") {
      if (!hasActiveClinic) return { type: "redirect", to: "/super-admin" };
      if (setupCompleted === false) return { type: "allow" };
      return { type: "redirect", to: "/dashboard" };
    }
    return { type: "allow" };
  }

  // c. Role error (non-super admin only)
  if (roleMissing) {
    return { type: "error", label: "User role not configured. Contact support." };
  }

  // e. Root redirect
  if (path === "/") {
    return {
      type: "redirect",
      to: resolveDefaultRoute({ role, clinicId, setupCompleted, membershipsCount }),
    };
  }

  // f. Public/always-allowed routes for authenticated non-super admins
  if (path === "/select-clinic") return { type: "allow" };

  // Block super-admin routes for non-super admins
  if (path.startsWith("/super-admin")) {
    return { type: "redirect", to: "/no-access" };
  }

  // g. Clinic required gate
  if (!hasActiveClinic) {
    return { type: "redirect", to: "/select-clinic" };
  }

  // h. Onboarding flow
  if (path === "/onboarding") {
    if (setupCompleted === false) return { type: "allow" };
    return { type: "redirect", to: "/dashboard" };
  }

  // i. Lifecycle billing restrictions (only block non-billing routes)
  if (lifecycleStatus === "suspended" || lifecycleStatus === "deactivated") {
    const inBillingAllowed = BILLING_ALLOWED_PATHS.some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
    if (!inBillingAllowed) {
      return { type: "redirect", to: "/billing" };
    }
  }

  // j. Setup enforcement
  if (setupCompleted === false) {
    return { type: "redirect", to: "/onboarding" };
  }

  // k. Default allow
  return { type: "allow" };
}
