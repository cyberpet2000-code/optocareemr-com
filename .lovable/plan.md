## Goal
Make `super_admin` a true global bypass, formalize the clinic lifecycle (`trial | active | suspended | deactivated`), and enforce strict tenant isolation everywhere.

---

## 1. Single source of truth for role + status

- **Role source**: `profiles.role` (already populated). `useAccess` + DB function `is_super_admin()` already read from `profiles`. Frontend `useRole` will keep reading from `useAccess` only — no other role lookups.
- **Clinic lifecycle**: replace the mixed `is_active` + `subscription_status` + `deactivated_at` triplet with a single column `clinics.lifecycle_status` (enum: `trial | active | suspended | deactivated`). Keep old columns for back-compat, derive them with a trigger so existing UI keeps working.

## 2. Database migration

1. Add enum `clinic_lifecycle` and column `clinics.lifecycle_status` (default `trial`); backfill from existing `is_active` / `subscription_status` / `deactivation_reason`.
2. Trigger `sync_clinic_lifecycle_columns`: keep `is_active`, `subscription_status`, `deactivation_reason` in sync from `lifecycle_status` so the rest of the app keeps working.
3. RPC `set_clinic_lifecycle(_clinic_id uuid, _next clinic_lifecycle, _reason text)` — `SECURITY DEFINER`:
   - Only callable by `is_super_admin(auth.uid())` (raises otherwise).
   - Enforces allowed transitions: `trial→active`, `active→suspended`, `active→deactivated`, `suspended→active`. Anything else raises.
   - Writes an entry to `audit_logs` with `action`, `old`/`new` status, reason.
4. Replace existing `activate_clinic_subscription` / `deactivate_clinic` callers in the UI with `set_clinic_lifecycle`.
5. **RLS hardening** (idempotent re-create on every tenant table — `patients`, `visits`, `appointments`, `billing`, `billing_items`, `followups`, `hmo_*`, `inventory`, `inventory_sale_items`, `inventory_sales`, `alerts`, `clinic_settings`, `clinic_feature_flags`):
   - SELECT/INSERT/UPDATE: `is_super_admin(auth.uid()) OR (clinic_id = current_clinic_id() AND lifecycle_allows_access(clinic_id))`.
   - DELETE: `is_super_admin OR (admin role AND clinic match AND lifecycle_allows_access)`.
   - New helper `lifecycle_allows_access(_clinic_id)` returns true when `lifecycle_status IN ('trial','active')`. Suspended/deactivated clinics block all tenant data writes/reads for non-super-admins. (Billing page exception handled in frontend by allowing the billing route even when blocked — see §4.)
6. Remove the duplicate `clinic settings access` / `Users see only their clinic` / `clinic can update its branding` policies on `clinics` and `clinic_settings` that bypass `is_super_admin` and OR-combine with weaker checks.
7. Drop the leftover `OR clinic_id IS NULL` clause from any policy that still has it (sweep).

## 3. Super admin "enter clinic" fix

Today `switchClinic` calls `assertClinicAccess` which requires a `user_roles` row — super admins usually don't have one per clinic, so they get "Access denied". Fix:
- `assertClinicAccess` returns `'super_admin'` immediately when the caller's profile has `role = 'super_admin'` (verified via a single `profiles` lookup) — no `user_roles` row required.
- `useAccess.effectiveClinicId` for super admin: use `activeClinicId` directly (no membership check). Memberships list stays for non-super users.
- `clinic_switch_log` insert tagged with `access_granted: true, reason: 'super_admin_bypass'` for super admin.

## 4. Frontend access guards

- `route-access.ts`: super_admin → all routes allowed except `/onboarding` (which is irrelevant for them). They can enter any clinic; `/dashboard` and clinic-scoped routes load with the chosen `activeClinicId`.
- For non-super users, when `clinic.lifecycle_status` is `suspended` or `deactivated`: redirect every protected route to `/billing` (read-only) with a banner. Only `/billing`, `/login`, `/no-access` accessible.
- `useRole.tsx`: keep current shape; expose a `bypassAll` flag that is true for super_admin so any future component-level check is uniform.

## 5. Super admin UI updates

- `SuperAdminClinics.tsx`: replace the single Activate/Deactivate toggle with four explicit actions (Activate, Suspend, Deactivate, Reactivate), each calling `set_clinic_lifecycle`. Buttons disabled when transition not allowed.
- Status badge derives from `lifecycle_status` (single switch).
- Every action shows a `console.debug('[lifecycle]', { clinic_id, from, to, by, reason })` log and a toast with the exact failure reason if RPC errors.

## 6. Debug logging

Add a small `logAccess()` helper called from `useAccess.loadAccess` and `switchClinic` that emits one structured `console.debug('[access]', {...})` line containing: `user_id`, `role`, `clinic_id`, `lifecycle_status`, `decision`, `reason`. No PII beyond IDs.

## 7. Sandbox leakage

The previous migration already strict-isolates tenant tables. This plan adds `lifecycle_allows_access` to the same policies so suspended/deactivated sandbox clinics also can't bleed even via stale sessions.

---

## Files touched
- New migration: `supabase/migrations/<ts>_clinic_lifecycle.sql`
- `src/lib/route-access.ts` — super admin bypass + lifecycle guard
- `src/hooks/useAccess.tsx` — bypass in `switchClinic` / `effectiveClinicId`, debug logging
- `src/hooks/useRole.tsx` — `bypassAll` flag
- `src/pages/SuperAdminClinics.tsx` — four-action lifecycle controls
- `src/pages/SuperAdminOperations.tsx` — read `lifecycle_status` instead of mixing fields

## Open questions (please confirm before I build)
1. **Suspended clinic UX**: should non-super users be force-redirected to `/billing` only, or should they see a full-page "Clinic suspended — contact admin" screen? Plan assumes redirect to `/billing`.
2. **Super admin "Enter" without user_roles row**: I'll let super admins enter ANY clinic with no membership check. Confirm this matches your intent (true global bypass).
3. **Lifecycle column**: I'll keep `is_active` / `subscription_status` as derived columns via trigger so legacy UI keeps working. OK?