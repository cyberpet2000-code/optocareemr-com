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
};

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
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { role: string }).role ?? null;
}

export function resolveProtectedRoute(input: ProtectedRouteInput): RouteDecision {
  const { path, isAuthenticated, isAuthReady, didTimeout, role, clinicId, setupCompleted, roleMissing, membershipsCount = 0 } = input;
  const isSuperAdmin = role === "super_admin";
  const hasActiveClinic = !!clinicId;

  if (!isAuthReady && !didTimeout) {
    return { type: "loading", label: "Loading OptoCare…" };
  }

  if (!isAuthenticated || didTimeout) {
    return { type: "redirect", to: "/login" };
  }

  if (roleMissing) {
    return { type: "error", label: "User role not configured. Contact support." };
  }

  if (path === "/") {
    return { type: "redirect", to: resolveDefaultRoute({ role, clinicId, setupCompleted, membershipsCount }) };
  }

  if (path === "/select-clinic") {
    return { type: "allow" };
  }

  if (path.startsWith("/super-admin")) {
    return { type: "allow" };
  }

  if (path === "/onboarding") {
    if (!hasActiveClinic) {
      return isSuperAdmin
        ? { type: "redirect", to: "/super-admin" }
        : { type: "redirect", to: "/select-clinic" };
    }
    if (setupCompleted === false) return { type: "allow" };
    return { type: "redirect", to: isSuperAdmin ? "/super-admin" : "/dashboard" };
  }

  // Any other clinic-scoped route
  if (!hasActiveClinic) {
    return isSuperAdmin
      ? { type: "redirect", to: "/super-admin" }
      : { type: "redirect", to: "/select-clinic" };
  }

  if (setupCompleted === false) {
    return { type: "redirect", to: "/onboarding" };
  }

  return { type: "allow" };
}
