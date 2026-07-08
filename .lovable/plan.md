# Finance, Reporting & Monthly Automated Email System

Non-breaking enhancement. No existing tables, routes, RLS, or UI will be rewritten. All changes are additive.

---

## 1. Database Migrations (additive only)

**New tables**

- `expenses` — clinic-scoped expense entries with category, amount, vendor, receipt URL, expense date.
- `inventory_movements` — audit log for every stock change (dispense, sale, adjustment, return, count) with before/after quantities, reason, patient, visit, staff.
- `monthly_reports` — cached generated reports (clinic, month, year, JSON payload, PDF storage path, status).
- `report_email_logs` — delivery log for monthly report emails (recipient, clinic, month, status, retries, error).

**Additive alters**

- Storage buckets: `expense-receipts` (private, clinic-scoped), `monthly-reports` (private, super-admin + clinic-admin scoped).
- Trigger on `inventory_sale_items`, `visits` (medication dispense fields) to insert into `inventory_movements` and decrement `inventory.quantity` if not already handled.

**RLS**

- `expenses`: clinic members can read; only admin/super_admin can write/delete.
- `inventory_movements`: clinic members can read; inserts allowed via SECURITY DEFINER triggers.
- `monthly_reports` & `report_email_logs`: clinic admin/super_admin read; service_role write.

No changes to existing tables' columns or policies unless a missing trigger is needed.

---

## 2. Expense Management Module

- Route `/finance/expenses` (new sidebar group "Finance").
- Page `src/pages/Expenses.tsx`: list + filters (category, date range, search), monthly totals card, CSV export.
- Dialog for add/edit/delete with receipt upload to `expense-receipts` bucket.
- Categories seeded as a const array (Salaries, Rent, Utilities, Fuel, Internet/Data, Advertising, Drugs, Frames, Contact Lenses, Lens Lab, Repairs, Equipment, Office Supplies, Taxes, Bank Charges, Miscellaneous).
- Edit/delete gated by `isAdmin || isSuperAdmin`.

---

## 3. Dashboard Enhancement (additive cards)

- New component `src/components/dashboard/FinanceOverview.tsx` appended below existing Dashboard content — existing layout untouched.
- Cards: Revenue (today/month), Expenses (today/month), Net Profit, Patients breakdown, Clinical Activity, Inventory, Billing.
- Uses recharts (already in stack) for small trend sparklines.

---

## 4. Inventory Audit

- New page `src/pages/InventoryAudit.tsx` at `/inventory/audit` — table of `inventory_movements` with filters.
- Verify deduction paths (`Billing`, `Visits` medication dispense, `inventory_sales`) — if a path bypasses deduction, add a shared helper `src/lib/inventoryMovement.ts` and call it. No rewrite of existing screens beyond wiring the helper.

---

## 5. Settings → Account

- New page `src/pages/AccountSettings.tsx` at `/settings/account`.
- Shows email, last login (`auth.users.last_sign_in_at` via edge function), last password change (tracked via new column on `profiles` or read from auth metadata), active sessions count.
- Actions: Change Email, Change Password, Send Password Reset — all use existing Supabase auth flows and existing `send-password-reset` edge function.
- Audit-only fixes to any broken auth wiring found; no login flow rewrite.

---

## 6. Monthly Report Engine

- Edge function `generate-monthly-report`:
  - Input: `clinic_id`, `year`, `month`.
  - Aggregates from `visits`, `billing`, `expenses`, `patients`, `inventory`, `inventory_movements`, `hmo_claims`.
  - Renders PDF using existing `pdf-lib` pattern from `generate-clinic-archive`.
  - Uploads to `monthly-reports` bucket, writes `monthly_reports` row with payload + path.
- Edge function `run-monthly-reports` (scheduled 1st of each month 02:00 UTC via `pg_cron` + `pg_net`):
  - Iterates every active clinic, invokes `generate-monthly-report` for previous month, then `send-monthly-report-email`.
- Edge function `send-monthly-report-email`:
  - Sends via existing `sendEmail` shared util from `reports@optocareemr.com`.
  - Recipients: clinic admin(s) + owner + optional `finance_email` on clinics.
  - Retries 3× on failure; logs to `report_email_logs`.

Optional additive column `clinics.finance_email` (nullable).

---

## 7. Reports UI

- `/reports/monthly` page listing cached `monthly_reports` for the current clinic, with view/download PDF.
- Super Admin sees all clinics' reports at `/super-admin/reports`.

---

## 8. Charts inside PDF

Server-side charts rendered as simple SVG via a lightweight helper in the edge function (no headless browser). Revenue trend, expense trend, net profit, patient growth, HMO distribution, product sales, top diagnoses.

---

## 9. Multi-Tenant Safety

- Every query in new code filters by `clinic_id = effectiveClinicId`.
- All new tables have RLS; edge functions use service role but scope by `clinic_id` from validated input.

---

## 10. Regression Protection

- No edits to `useAuth`, `useAccess`, existing route guards, existing dashboard layout, existing billing/inventory pages beyond wiring the movement helper.
- All new UI mounted under new routes; sidebar gets an additive "Finance" group and one "Inventory Audit" link.
- Existing types file (`supabase/integrations/types.ts`) will be regenerated automatically after migrations.

---

## Delivery Order

1. Migration 1: `expenses`, `inventory_movements`, `monthly_reports`, `report_email_logs`, storage buckets, triggers.
2. Expense module + sidebar link.
3. Inventory movement helper + Inventory Audit page.
4. Dashboard finance cards.
5. Account settings page.
6. Monthly report edge functions + cron.
7. Reports UI (clinic + super admin).
8. Verification pass (build + targeted Playwright smoke on new routes).

---

## Scope Confirmation Needed

This is a large multi-part build (~4 edge functions, 4 new tables, 5+ new pages, cron job). Confirm you want it all in one pass, or I can ship it in the numbered stages above so you can review incrementally.
