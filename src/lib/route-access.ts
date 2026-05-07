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
}: {
  role: string | null;
  clinicId: string | null | undefined;
  setupCompleted: boolean | null | undefined;
}) {
  if (role === "super_admin") {
    if (clinicId && setupCompleted === false) return "/onboarding";
    if (clinicId && setupCompleted) return "/dashboard";
    return "/super-admin";
  }
  if (!clinicId || setupCompleted === false) return "/onboarding";
  return "/dashboard";
}

export function resolveProtectedRoute(input: ProtectedRouteInput): RouteDecision {
  const { path, isAuthenticated, isAuthReady, didTimeout, role, clinicId, setupCompleted, roleMissing } = input;
  const isSuperAdmin = role === "super_admin";
  const hasActiveClinic = !!clinicId;
  const requiresOnboarding = (!isSuperAdmin || hasActiveClinic) && (!clinicId || setupCompleted === false);

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
    return { type: "redirect", to: resolveDefaultRoute({ role, clinicId, setupCompleted }) };
  }

  if (path.startsWith("/super-admin")) {
    return { type: "allow" };
  }

  if (path === "/onboarding") {
    if (!clinicId) {
      return isSuperAdmin ? { type: "redirect", to: "/super-admin" } : { type: "error", label: "No active clinic. Contact support." };
    }
    if (setupCompleted === false) return { type: "allow" };
    return { type: "redirect", to: isSuperAdmin ? "/super-admin" : "/dashboard" };
  }

  if (path.startsWith("/dashboard")) {
    if (isSuperAdmin) {
      if (!hasActiveClinic) return { type: "redirect", to: "/super-admin" };
      if (setupCompleted === false) return { type: "redirect", to: "/onboarding" };
      return { type: "allow" };
    }
    return requiresOnboarding ? { type: "redirect", to: "/onboarding" } : { type: "allow" };
  }

  if (isSuperAdmin && !path.startsWith("/super-admin")) {
    if (!hasActiveClinic) return { type: "redirect", to: "/super-admin" };
    if (setupCompleted === false && path !== "/onboarding") return { type: "redirect", to: "/onboarding" };
    return { type: "allow" };
  }

  if (requiresOnboarding) {
    return { type: "redirect", to: "/onboarding" };
  }

  return { type: "allow" };
}