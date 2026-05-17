# OptoCare Diagnostic Layer

Opt-in observability for frontend (auth/routing/hydration), backend
(RLS/permissions), and performance. Off by default in production.

## Enable

- Append `?diag=1` to any URL, or
- Run in dev (`import.meta.env.DEV`), or
- `localStorage.setItem("optocare_diag", "1")` then reload.

Disable with `?diag=0` or `localStorage.removeItem("optocare_diag")`.

## Overlay

When enabled, a tiny `diag` chip appears bottom-right. Click or press
**Ctrl+Shift+D** to open. Tabs: `all`, `errors`, `perf`. Use `copy` to
export the full ring buffer as JSON for a bug report.

## API

```ts
import { diag } from "@/lib/diag";

diag.event("auth", "session-resolved", { hasSession });
diag.warn("hydration", "clinic-name-empty", { profileId });
diag.error("query", "patients", err, { table: "patients" });

const end = diag.time("perf", "super-admin-stats");
await Promise.all([...]);
end({ resultCount });
```

Areas: `auth | routing | hydration | query | rls | perf`.

## Cause hints

Add or edit rules in `diagRules.ts`. Postgres codes (e.g. `42P17`,
`42501`, `PGRST301`) and event names map to human-readable suggestions
which appear under each entry in the overlay.

## What it does NOT do

- No new providers, no global event bus, no retries.
- No production telemetry shipped to a server.
- No mutation of existing user-facing error messages.
