# Clinic Operations Engine

Build an intelligent ops layer on top of existing clinics + onboarding tables.

## 1. Database (migration)

New tables:
- `auto_fix_logs` — clinic_id, issue_detected, action_taken, status, details(jsonb), timestamp. RLS: super_admin read all; clinic admins read their own.
- `clinic_success_scores` — clinic_id (unique), score (0-100), status ('healthy'|'at_risk'|'critical'), factors(jsonb), insights(text[]), calculated_at. RLS same pattern.

New columns on `clinics`:
- `deactivated_at timestamptz`, `deactivation_reason text`

New SECURITY DEFINER functions:
- `calculate_clinic_success_score(_clinic_id uuid)` → returns jsonb {score, status, factors, insights}, upserts into `clinic_success_scores`.
- `check_trial_expiration()` → loops clinics where trial expired & not active subscription, sets `is_active = false`, `deactivated_at = now()`, logs alert.
- `activate_clinic_subscription(_clinic_id uuid)` → sets `subscription_status='active'`, `is_active=true`, clears deactivation. Super-admin only.
- `deactivate_clinic(_clinic_id uuid, _reason text)` → super-admin only.
- `run_auto_fix(_clinic_id uuid)` → checks rules, logs to `auto_fix_logs`. Returns count of fixes.

pg_cron (separate insert SQL, not migration): daily job calling `check_trial_expiration()` + score recalc.

## 2. Edge functions

- `clinic-ops-engine` (verify_jwt=true) — POST actions: `recalculate_score`, `run_auto_fix`, `activate`, `deactivate`. Validates super_admin via has_role. For invite-not-accepted fix, calls `send-invite-email` to resend.

## 3. Frontend

- Update `useClinic.tsx`: derive `isDeactivated`, `subscriptionRequired` (= !is_active && !super_admin).
- Update `TrialGuard` / `AppLayout`: when deactivated, route non-admins to `/billing` only; show "Subscription required" screen.
- New page `/super-admin/operations` (`SuperAdminOperations.tsx`): system intelligence panel — at-risk clinics, auto-fixed today, expired trials today, trial→paid conversion, list with score, status badge, **Activate / Deactivate buttons** per clinic, Run Auto-Fix button, Recalculate Score button.
- Update `SuperAdminClinics.tsx`: add Activate/Deactivate buttons inline on each clinic row, status badges (Trial Active, Expiring Soon, Active, Expired, Suspended).
- Add nav link in sidebar for super admins.

## 4. Access control
- Activate/Deactivate buttons gated by `useRole().isSuperAdmin`.
- Deactivated clinics: dashboard locked except `/billing` for clinic admin; super_admin bypasses everything.

## Tech notes
- Score weights match spec (30/15/10/10/10/10/10/5).
- Status thresholds: ≥80 healthy, ≥50 at_risk, else critical.
- "Trial Expiring Soon" = ≤3 days left.
- Auto-fix rules implemented inside `run_auto_fix` plpgsql + edge function for email-resend side-effects.
