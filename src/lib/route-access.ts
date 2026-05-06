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
  if (role === "super_admin") return "/super-admin";
  if (!clinicId || setupCompleted === false) return "/onboarding";
  if (setupCompleted === false) return "/onboarding";
  return "/dashboard";
}

export function resolveProtectedRoute(input: ProtectedRouteInput): RouteDecision {
  const { path, isAuthenticated, isAuthReady, didTimeout, role, clinicId, setupCompleted, roleMissing } = input;
  const isSuperAdmin = role === "super_admin";
  const requiresOnboarding = !isSuperAdmin && (!clinicId || setupCompleted === false);

  if (!isAuthReady && !didTimeout) {
    return { type: "loading", label: "Loading OptoCare…" };
  }

  if (!isAuthenticated || didTimeout) {
    return { type: "redirect", to: "/login" };
  }

  if (roleMissing) {
    return { type: "loading", label: "User role not configured. Contact support." };
  }

  if (path === "/") {
    return { type: "redirect", to: resolveDefaultRoute({ role, clinicId, setupCompleted }) };
  }

  if (path.startsWith("/super-admin")) {
    return isSuperAdmin ? { type: "allow" } : { type: "redirect", to: requiresOnboarding ? "/onboarding" : "/dashboard" };
  }

  if (path === "/onboarding") {
    if (isSuperAdmin) return { type: "redirect", to: "/super-admin" };
    return requiresOnboarding ? { type: "allow" } : { type: "redirect", to: "/dashboard" };
  }

  if (path.startsWith("/dashboard")) {
    return isSuperAdmin ? { type: "redirect", to: "/super-admin" } : requiresOnboarding ? { type: "redirect", to: "/onboarding" } : { type: "allow" };
  }

  if (isSuperAdmin && !path.startsWith("/super-admin")) {
    return { type: "redirect", to: "/super-admin" };
  }

  if (requiresOnboarding) {
    return { type: "redirect", to: "/onboarding" };
  }

  return { type: "allow" };
}