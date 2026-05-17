// Cause-hint rules. Pure lookup from a Postgres/PostgREST code or
// a structured event name to a human-readable suggestion.

const PG_CODE_HINTS: Record<string, string> = {
  "42501": "Permission denied by RLS. Likely missing policy for the current role, or auth.uid() is null.",
  "42P17": "Recursive RLS policy. Move the role/membership check into a SECURITY DEFINER function.",
  "PGRST301": "JWT missing or expired. Check Supabase session persistence (localStorage).",
  "PGRST302": "JWT invalid. Verify the anon key and that Authorization header is set.",
  "PGRST116": "No rows returned where one was expected. Check filters or row visibility under RLS.",
  "23505": "Unique constraint violation. Duplicate value for a unique column.",
  "23503": "Foreign key violation. The referenced row does not exist.",
  "23502": "NOT NULL violation. A required column was missing.",
};

const EVENT_HINTS: Record<string, string> = {
  "auth/no-session-after-login": "Login succeeded but storage write failed. Verify window.localStorage is writable.",
  "auth/session-resolved-empty": "No session on boot. User is logged out or storage was cleared.",
  "hydration/clinic-name-empty": "Profile loaded but active_clinic_id is missing or clinic row not visible.",
  "hydration/roles-empty": "User has no rows in user_roles / clinic_users. Check membership and RLS.",
  "query/slow": "Query took longer than 1500ms. Check indexes, payload size, or N+1 fan-out.",
  "routing/redirect-loop": "Route guard keeps redirecting. Inspect resolveProtectedRoute inputs.",
};

export function hintFor(input: { code?: string | null; event?: string | null; status?: number | null }): string | null {
  if (input.code && PG_CODE_HINTS[input.code]) return PG_CODE_HINTS[input.code];
  if (input.event && EVENT_HINTS[input.event]) return EVENT_HINTS[input.event];
  if (input.status === 401 || input.status === 403) {
    return "Auth rejected by PostgREST. Token missing/expired or RLS denies the request.";
  }
  if (input.status && input.status >= 500) {
    return "Server-side failure. Check Supabase logs and RLS recursion.";
  }
  return null;
}
