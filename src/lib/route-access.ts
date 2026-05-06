export const ACCESS_TIMEOUT_MS = 5000;

type ProtectedRouteInput = {
  path: string;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isContextLoading: boolean;
  didTimeout: boolean;
  isSuperAdmin: boolean;
  setupCompleted: boolean | null | undefined;
};

type RouteDecision =
  | { type: "allow" }
  | { type: "loading"; label: string }
  | { type: "redirect"; to: string };

export function resolveDefaultRoute({
  isSuperAdmin,
  setupCompleted,
}: {
  isSuperAdmin: boolean;
  setupCompleted: boolean | null | undefined;
}) {
  if (isSuperAdmin) return "/super-admin-dashboard";
  if (setupCompleted === false) return "/onboarding";
  return "/dashboard";
}

export function resolveProtectedRoute(input: ProtectedRouteInput): RouteDecision {
  const { path, isAuthenticated, isAuthLoading, isContextLoading, didTimeout, isSuperAdmin, setupCompleted } = input;

  if (isAuthLoading || (isAuthenticated && isContextLoading && !didTimeout)) {
    return { type: "loading", label: isAuthLoading ? "Loading session…" : "Loading user session…" };
  }

  if (!isAuthenticated || didTimeout) {
    return { type: "redirect", to: "/login" };
  }

  if (path === "/") {
    return { type: "redirect", to: resolveDefaultRoute({ isSuperAdmin, setupCompleted }) };
  }

  if (path.startsWith("/super-admin")) {
    return isSuperAdmin ? { type: "allow" } : { type: "redirect", to: "/dashboard" };
  }

  if (path === "/onboarding") {
    if (isSuperAdmin) return { type: "redirect", to: "/super-admin-dashboard" };
    if (setupCompleted === false) return { type: "allow" };
    return { type: "redirect", to: "/dashboard" };
  }

  if (path.startsWith("/dashboard")) {
    return isSuperAdmin ? { type: "redirect", to: "/super-admin-dashboard" } : { type: "allow" };
  }

  if (isSuperAdmin) {
    return { type: "redirect", to: "/super-admin-dashboard" };
  }

  if (setupCompleted === false) {
    return { type: "redirect", to: "/onboarding" };
  }

  return { type: "allow" };
}