# OptoCare EMR — Diagnostic Layer Design

A thin, opt-in observability layer that surfaces real frontend, backend, and performance failures without touching auth, routing, providers, or business logic.

## Goals

- Surface **exact** failures (e.g. `patients query failed: permission denied`) instead of generic messages.
- Suggest **likely causes** (missing RLS policy, stale clinic state, expired JWT).
- Stay **disabled by default in production**, toggle-able per session.
- Zero impact on render path, no new providers, no global event bus, no retries.

## Architecture

```text
                    ┌──────────────────────────────┐
                    │  src/lib/diag/               │
                    │                              │
   app code ──────► │  diag.ts        (core API)   │
                    │  diagConfig.ts  (on/off)     │
                    │  diagRules.ts   (cause hints)│
                    │  diagSinks.ts   (console,    │
                    │                  ring buffer)│
                    │  DiagOverlay.tsx (dev panel) │
                    └──────────────────────────────┘
                              │
              ┌───────────────┼───────────────────┐
              ▼               ▼                   ▼
        apiClient        useAccess           Router/
        wrapper          hydration           AppLayout
        (supabase        checkpoints         route timing
         errors)
```

One folder. No provider. No context. Pure functions + an optional dev-only overlay.

## Activation

- **Off in production** unless one of:
  - `localStorage.optocare_diag = "1"` (manual toggle)
  - URL has `?diag=1`
  - `import.meta.env.DEV` is true
- A single `isDiagEnabled()` short-circuits every call to ~1 boolean check.

## Public API (tiny)

```ts
diag.event(area, name, data?)        // structured log
diag.error(area, name, err, hints?)  // logs + suggests causes
diag.time(area, name) → end()        // perf span
diag.snapshot()                       // dump ring buffer (JSON)
```

`area` is a fixed union: `"auth" | "routing" | "hydration" | "query" | "rls" | "perf"`.

## What it captures (instrumentation points)

| Layer | Hook point | Captured |
|---|---|---|
| Backend queries | `src/lib/apiClient.ts` (already wraps fetch + invoke) | URL, table, status, Postgres `code`, `message`, duration |
| RLS / permission | same wrapper, classifier on `42501`, `42P17`, `PGRST301` | "permission denied", "infinite recursion in policy", "JWT missing" |
| Auth | `useAccess` checkpoints: `session-resolved`, `profile-loaded`, `roles-loaded`, `clinic-resolved` | timing + which step stalled |
| Hydration | `AppLayout` mount, first non-loading render | time-to-shell, time-to-clinic-name |
| Routing | `App.tsx` route change listener (read-only) | route, duration |
| Perf | `diag.time` around expensive effects + the SuperAdmin stats queries | ms per span, slowest-N |

No new provider; instrumentation is a few one-line calls inside existing files.

## Cause-hint rules (diagRules.ts)

Pure lookup table from `{ area, code|name }` → hint string. Examples:

```ts
"42501"     → "RLS denied. Missing policy or wrong auth.uid()."
"42P17"     → "Recursive RLS policy. Use SECURITY DEFINER helper."
"PGRST301"  → "JWT expired or missing. Check session persistence."
"auth/no-session-after-login" → "Storage write failed; verify localStorage."
"hydration/clinic-name-empty" → "Profile loaded but active_clinic_id null."
"query/duration>1500" → "Slow query; check indexes or N+1 pattern."
```

Rules live in one file, easy to extend.

## Sinks

1. **Console** — colored, grouped: `[diag:rls] patients query failed: permission denied → hint: …`
2. **Ring buffer** — last 200 events in memory (`globalThis.__optocareDiag`).
3. **Overlay (dev only)** — `DiagOverlay.tsx`, lazy-loaded, opens with `Ctrl+Shift+D`. Shows tabs: Events / Errors / Perf / Snapshot (copy JSON).

No network sink, no localStorage spam, no Sentry dependency.

## What it does NOT do

- No auth refactor, no provider, no context, no router replacement.
- No retries, no auto-recovery, no global event bus.
- No production telemetry shipped to a server (can be added later behind the same flag).
- No mutation of working error messages — only **adds** structured logging and overlay.

## Implementation steps

1. Create `src/lib/diag/` with `diag.ts`, `diagConfig.ts`, `diagRules.ts`, `diagSinks.ts`.
2. Add ~5 instrumentation calls:
   - `apiClient.ts`: log non-2xx with table + Postgres code.
   - `useAccess.tsx`: 4 checkpoint `diag.event` calls.
   - `AppLayout.tsx`: one `diag.time("hydration","shell")`.
   - `App.tsx`: route-change listener.
   - `SuperAdminDashboard.tsx`: wrap each stat query in `diag.time`.
3. Add `DiagOverlay.tsx`, lazy-mount only when `isDiagEnabled()`.
4. Add a short `README` in `src/lib/diag/` with toggle instructions.

## Files touched

- **New:** `src/lib/diag/{diag,diagConfig,diagRules,diagSinks}.ts`, `src/lib/diag/DiagOverlay.tsx`, `src/lib/diag/README.md`
- **Edited (1–3 lines each):** `src/lib/apiClient.ts`, `src/hooks/useAccess.tsx`, `src/components/AppLayout.tsx`, `src/App.tsx`, `src/pages/SuperAdminDashboard.tsx`

## Expected outcome

- Turn on with `?diag=1`, open overlay, reproduce a bug.
- Instead of "Failed to load stats" you see:
  `[diag:rls] HEAD /clinics?select=id → 500 (42P17) infinite recursion in policy for "user_roles" — hint: recursive RLS policy, use SECURITY DEFINER helper.`
- Hydration tab shows: `session 120ms · profile 80ms · roles ✗ (500) · clinic — stuck`.
- Zero overhead and zero visible UI when disabled.
