# System Audit — System Health Integration

Repository: cyberpet2000-code/optocareemr-com
Branch: feature/super-admin-system-health
Date: 2026-05-18

Summary
---
This audit reviews the code changes made to integrate the Super Admin System Health dashboard and performs a repository-wide stability review for TypeScript, imports, potential runtime issues, and risks related to auth/session, clinic hydration, Supabase queries, and rendering.

Critical issues
---
- Telemetry & Error handling not wired: ErrorBoundary.componentDidCatch contains TODO; without telemetry critical runtime errors may be missed in production. (Risk: Medium)
- Supabase RPC & writes executed without retry/backoff: several pages (Onboarding, Dashboard, Billing, HMO management) perform RPCs and inserts without retry or transaction handling; failed writes can leave partial state. (Risk: High)
- Auth assumptions in SuperAdmin routes: routes under /super-admin assume user has super_admin role and ProtectedRouteGate + SuperAdminOnly rely on role check; if role data is stale, users may be redirected incorrectly. (Risk: Medium)

Warnings
---
- Several long-running or batch Supabase queries (select with no limit, or full counts) may be expensive on large datasets (e.g., SuperAdminDashboard counts across profiles/patients/clinics). Consider adding server-side endpoints or paginated counts. (Risk: Medium)
- Clinic hydration logic (ClinicSwitcher, ClinicSidebar) loads full clinic lists for super_admin — could be large. Consider paginated or filtered fetch. (Risk: Medium)
- Potential missing cleanup for in-flight requests in some effects — most use cancellation flags but not all (some components rely on mounted checks). Could lead to React state updates on unmounted components. (Risk: Low)

TypeScript and imports
---
- No duplicate exports detected in modified files.
- All added imports resolve to existing paths in the repo using the established import conventions ("./pages/..." and "@/..." aliases). SystemHealth is added at src/pages/super-admin/SystemHealth and imported as "./pages/super-admin/SystemHealth".
- Ensure your tsconfig paths and alias (@) are configured; existing project already uses them.

Unused imports / files
---
- No new unused files were introduced. The new SystemHealth components are referenced by AppRoutes and ClinicSidebar.
- There may be other unused files across repo (not exhaustively scanned here). Recommend running: `pnpm -w -s ts-prune` or `eslint --ext .ts,.tsx --rule "no-unused-vars: error"` to detect unused exports/imports.

Circular dependencies
---
- No obvious circular imports introduced by these changes. Existing project structure uses hooks and UI components; if you experience circular dependency build warnings, run a tool like madge to locate cycles: `npx madge --circular src`.

Auth / session risks
---
- useAccess / useRole hooks drive route gating. Risk arises if the client-side role cache is stale — ensure role refresh occurs after permission changes or sign-in.
- Session timeouts rely on ACCESS_TIMEOUT_MS; ensure server-side session invalidation and token refresh are aligned.
- Some components write audit/activity logs using apiClient.from(...).insert — ensure these writes cannot be abused by client-side inputs (validate server-side via DB RLS or RPCs).

Clinic hydration risks
---
- Clinic hydration and ClinicSwitcher perform full clinic queries for super_admin: `apiClient.from('clinics').select(...)` — can be large. Consider limiting fields, pagination, or a dedicated admin endpoint that returns summary.
- Components assume clinic setup flags (setup_completed) are accurate; if migrations partially applied, UI may show incorrect state. Add defensive checks and fallback UI.

Supabase query risks
---
- Several components use `.select()` without `eq('clinic_id', cid)` guards under certain paths — ensure every user-scoped query is appropriately filtered by clinic_id to avoid data leakage.
- Batch operations (inserting billing items, HMO claims, etc.) are done without transactions — if intermediate steps fail, partial data may persist. Use RPCs or server-side transactions where possible.

React rendering risks
---
- Large lists (diagnostics, patients, inventory) render without virtualization; could cause slowness on large datasets. Implement react-window/react-virtual for lists with thousands of items.
- Some useEffect hooks perform async operations and set state after await without cancellation in all paths — though many components use a cancelled flag pattern, check all pages for consistent cancellation to avoid setState on unmounted component warnings.

Mobile responsiveness
---
- New System Health UI uses Tailwind responsive classes (grid single-column on mobile, multi-column on larger screens). It follows existing project patterns and should be responsive.
- Sidebar uses md:flex to hide on small screens; verify that the System Health route remains reachable via mobilePrimary navigation. Mobile primary items are set in AppLayout—if the super-admin workspace needs mobile shortcut, consider adding System Health to `mobilePrimary` when workspace is super-admin.

Recommended fixes
---
1. Wire telemetry in ErrorBoundary.componentDidCatch to capture errors (Sentry/Datadog). Mark as high priority for production.
2. Replace client-side multi-step DB operations with server-side RPCs or transactions for atomicity (Onboarding, Billing, HMO flows).
3. Add pagination/limits to admin queries (SuperAdminDashboard counts, ClinicSwitcher clinics list). For counts, prefer dedicated summary endpoints that use efficient DB counters.
4. Add retry/backoff for critical writes and queries (use react-query mutation options or custom logic).
5. Audit Supabase queries for missing clinic_id filters and enforce RLS policies to prevent data leakage.
6. Add virtualization for long lists (diagnostics, patients) when row counts exceed a few hundred.
7. Add unit/integration tests for SystemHealth components (copy/export/clear logs, diagnostics expand/collapse) and add an accessibility audit.

Risk level for MVP testing
---
- Overall risk for an internal MVP: Medium.
  - The System Health UI itself uses mocked data and is low risk for display.
  - The primary operational risks are around Supabase queries and multi-step writes elsewhere in the app (high impact if data inconsistency occurs).
  - Authentication gating and client-side role caching need verification in staging to avoid unauthorized access.

Notes & next steps
---
- This audit is based on a static scan of modified files and selected project files; it is not a full static analysis. For a complete repository audit, run:
  - TypeScript build: `pnpm run build` or `tsc --noEmit`
  - ESLint: `pnpm lint`
  - Circular dependency check: `npx madge --circular src`
  - Unused exports: `npx ts-prune`

View more code search results at: https://github.com/cyberpet2000-code/optocareemr-com/search?q=super-admin&type=code

