// Send a submitted Daily Front Desk Report manually via the configured clinic recipient.
// Authentication is checked in the function; the Resend key never reaches the browser.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendEmail } from "../_shared/sendEmail.ts";
import { escapeHtml } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const validEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const money = (value: unknown) =>
  "₦" +
  (Number(value) || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const safe = (value: unknown) => escapeHtml(String(value ?? "—"));

const refraction = (sphere: unknown, cyl: unknown, axis: unknown) => {
  const parts = [sphere, cyl, axis]
    .map((v) => (v === null || v === undefined || v === "" ? "" : String(v)))
    .filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 3) return `${parts[0]} / ${parts[1]} ×${parts[2]}`;
  return parts.join(" / ");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  try {
    const caller = createClient(SUPABASE_URL, authorization.replace("Bearer ", ""));
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const reportId = typeof body?.report_id === "string" ? body.report_id.trim() : "";
    if (!reportId) return json({ error: "report_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: report, error: reportError } = await admin
      .from("daily_front_desk_reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError || !report) return json({ error: "Daily report not found" }, 404);

    const { data: membership } = await admin
      .from("clinic_users")
      .select("user_id,role")
      .eq("clinic_id", report.clinic_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const { data: profile } = await admin
      .from("profiles")
      .select("is_super_admin,is_active")
      .eq("id", userData.user.id)
      .maybeSingle();

    const allowed =
      !!membership &&
      ["receptionist", "admin"].includes(String(membership.role || "")) ||
      profile?.is_super_admin === true && profile?.is_active === true;

    if (!allowed) return json({ error: "Daily report access required" }, 403);
    if (report.status !== "submitted") {
      return json({ error: "Submit the daily report before sending it by email" }, 400);
    }

    const { data: clinic, error: clinicError } = await admin
      .from("clinics")
      .select("id,name,daily_report_email,logo_url,theme_color")
      .eq("id", report.clinic_id)
      .maybeSingle();

    if (clinicError || !clinic) return json({ error: "Clinic not found" }, 404);

    const recipient = String(clinic.daily_report_email || "").trim().toLowerCase();
    if (!validEmail(recipient)) {
      return json({ error: "No valid daily report recipient email is configured" }, 400);
    }

    const [itemsRes, activitiesRes, expensesRes, financeRes] = await Promise.all([
      admin.from("daily_front_desk_report_items")
        .select("*")
        .eq("report_id", report.id)
        .order("created_at", { ascending: true }),
      admin.from("daily_front_desk_activities")
        .select("*")
        .eq("report_id", report.id)
        .order("created_at", { ascending: true }),
      admin.from("daily_front_desk_expenses")
        .select("*")
        .eq("report_id", report.id)
        .order("created_at", { ascending: true }),
      admin.rpc("get_daily_front_desk_financials", {
        p_clinic_id: report.clinic_id,
        p_report_date: report.report_date,
      }),
    ]);

    if (itemsRes.error) throw itemsRes.error;
    if (activitiesRes.error) throw activitiesRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (financeRes.error) throw financeRes.error;

    const items = itemsRes.data || [];
    const activities = activitiesRes.data || [];
    const expenses = expensesRes.data || [];
    const finance = Array.isArray(financeRes.data) ? financeRes.data[0] : financeRes.data;

    // Keep the emailed HMO workflow aligned with the front-desk UI:
    // HMO request -> request response -> amount to claim -> claim sent -> claim response.
    const hmoClaimIds = [...new Set(
      itemsRes.data
        .map((item: any) => item.hmo_claim_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
    )];

    const { data: hmoClaims, error: hmoClaimsError } = hmoClaimIds.length
      ? await admin
          .from("hmo_claims")
          .select("id,hmo_request_sent,hmo_request_status,hmo_request_response_at,hmo_request_remarks,service_cost,approved_amount,claim_sent,claim_response_status,claim_response_at,claim_response_remarks")
          .in("id", hmoClaimIds)
      : { data: [], error: null };

    if (hmoClaimsError) throw hmoClaimsError;
    const hmoClaimMap = new Map<string, any>(
      (hmoClaims || []).map((claim: any) => [claim.id, claim]),
    );

    // The report items intentionally do not duplicate clinical data.
    // Read the final prescription directly from the completed visit for the email.
    const visitIds = [...new Set(
      items
        .map((item: any) => item.visit_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
    )];

    const { data: visitRows, error: visitsError } = visitIds.length
      ? await admin
          .from("visits")
          .select("id,sub_od_sphere,sub_od_cyl,sub_od_axis,sub_os_sphere,sub_os_cyl,sub_os_axis,sub_reading_add,lens_type")
          .in("id", visitIds)
      : { data: [], error: null };

    if (visitsError) throw visitsError;

    const visitMap = new Map<string, any>(
      (visitRows || []).map((visit: any) => [visit.id, visit]),
    );

    const patientRows = items.length
      ? items.map((p: any) => {
          const visit = p.visit_id ? visitMap.get(p.visit_id) : null;
          const hasPrescription = !!(
            visit?.sub_od_sphere !== null ||
            visit?.sub_od_cyl !== null ||
            visit?.sub_od_axis !== null ||
            visit?.sub_os_sphere !== null ||
            visit?.sub_os_cyl !== null ||
            visit?.sub_os_axis !== null ||
            visit?.sub_reading_add !== null ||
            visit?.lens_type
          );

          return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top">
            <strong>${safe(p.patient_name)}</strong><br/>
            <span style="font-size:11px;color:#64748b">${safe(p.patient_number)} · ${safe(p.patient_type)}${p.hmo_name ? ` · ${safe(p.hmo_name)}` : ""}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px">
            ${p.glasses_prescription_sent ? "Prescription sent" : "Prescription not sent"}<br/>
            Lens: ${safe(p.lens_order_status || (p.lens_order_required ? "pending" : "not required"))}
          </td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px">
            ${p.patient_type === "hmo" ? (() => {
              const claim = p.hmo_claim_id ? hmoClaimMap.get(p.hmo_claim_id) : null;
              if (!claim) return `HMO record not linked<br/>Amount to claim: ${money(p.hmo_amount_to_claim)}`;
              const amountToClaim = Number(claim.approved_amount) > 0 ? claim.approved_amount : claim.service_cost;
              return `Request sent: ${claim.hmo_request_sent ? "Yes" : "No"}<br/>Request status: ${safe(claim.hmo_request_status || "Not sent")}<br/>Request remarks: ${safe(claim.hmo_request_remarks)}<br/>Amount to claim: ${money(amountToClaim)}<br/>Claim sent: ${claim.claim_sent ? "Yes" : "No"}<br/>Claim response: ${safe(claim.claim_response_status || "Pending")}<br/>Claim remarks: ${safe(claim.claim_response_remarks)}`;
            })() : "Private"}
          </td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px">
            ${p.eye_drop_quantity || 0} dispensed
          </td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px">
            ${safe(p.remarks)}
          </td>
        </tr>
        ${(p.glasses_prescription_sent || p.lens_order_required || hasPrescription) ? `
        <tr>
          <td colspan="5" style="padding:6px 8px 12px;background:#f8fafc;font-size:11px;color:#475569">
            <strong>Final Rx:</strong>
            OD ${safe(refraction(visit?.sub_od_sphere,visit?.sub_od_cyl,visit?.sub_od_axis))} ·
            OS ${safe(refraction(visit?.sub_os_sphere,visit?.sub_os_cyl,visit?.sub_os_axis))} ·
            ADD ${safe(visit?.sub_reading_add)} ·
            Lens type: ${safe(visit?.lens_type)}
            ${p.lens_order_remarks ? ` · Order: ${safe(p.lens_order_remarks)}` : ""}
          </td>
        </tr>` : ""}`;
        }).join("")
      : `<tr><td colspan="5" style="padding:14px;color:#64748b;text-align:center">No patient entries recorded.</td></tr>`;

    const activityRows = activities.length
      ? activities.map((a: any) => `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0">${safe(a.description)}</td><td style="padding:7px;border-bottom:1px solid #e2e8f0">${safe(a.payment_method)}</td><td style="padding:7px;text-align:right;border-bottom:1px solid #e2e8f0">${money(a.amount)}</td></tr>`).join("")
      : `<tr><td colspan="3" style="padding:12px;color:#64748b;text-align:center">No manually recorded activities.</td></tr>`;

    const expenseRows = expenses.length
      ? expenses.map((e: any) => `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0">${safe(e.description)}</td><td style="padding:7px;border-bottom:1px solid #e2e8f0">${safe(e.payment_method)}</td><td style="padding:7px;text-align:right;border-bottom:1px solid #e2e8f0">${money(e.amount)}</td></tr>`).join("")
      : `<tr><td colspan="3" style="padding:12px;color:#64748b;text-align:center">No expenses recorded.</td></tr>`;

    const subject = `Daily Front Desk Report — ${clinic.name} — ${report.report_date}`;
    const html = `
      <h2 style="margin:0 0 4px;color:#1e40af">${safe(clinic.name)}</h2>
      <p style="margin:0 0 18px;color:#64748b">Daily Front Desk Report · ${safe(report.report_date)}</p>

      <h3 style="margin:18px 0 7px;color:#1e40af">Patient-by-Patient Operations</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc;text-align:left">
          <th style="padding:8px">Patient</th><th style="padding:8px">Prescription / Lens</th>
          <th style="padding:8px">HMO</th><th style="padding:8px">Medication</th><th style="padding:8px">Remarks</th>
        </tr></thead>
        <tbody>${patientRows}</tbody>
      </table>

      <h3 style="margin:22px 0 7px;color:#1e40af">Financial Summary</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:5px 0">Cash received</td><td style="text-align:right">${money(finance?.cash_received)}</td></tr>
        <tr><td style="padding:5px 0">Transfer received</td><td style="text-align:right">${money(finance?.transfer_received)}</td></tr>
        <tr><td style="padding:5px 0">POS/Card received</td><td style="text-align:right">${money(finance?.card_received)}</td></tr>
        <tr><td style="padding:5px 0">HMO received</td><td style="text-align:right">${money(finance?.hmo_received)}</td></tr>
        <tr><td style="padding:7px 0;font-weight:700;border-top:1px solid #e2e8f0">Total income</td><td style="text-align:right;font-weight:700;border-top:1px solid #e2e8f0">${money(finance?.total_income)}</td></tr>
        <tr><td style="padding:5px 0">Total expenses</td><td style="text-align:right">${money(finance?.total_expenses)}</td></tr>
        <tr><td style="padding:7px 0;font-weight:700">Daily balance</td><td style="text-align:right;font-weight:700">${money(finance?.daily_balance)}</td></tr>
      </table>

      <h3 style="margin:22px 0 7px;color:#1e40af">Sales / Other Activities</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc;text-align:left"><th style="padding:7px">Description</th><th style="padding:7px">Method</th><th style="padding:7px;text-align:right">Amount</th></tr></thead>
        <tbody>${activityRows}</tbody>
      </table>

      <h3 style="margin:22px 0 7px;color:#1e40af">Expenses</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc;text-align:left"><th style="padding:7px">Description</th><th style="padding:7px">Method</th><th style="padding:7px;text-align:right">Amount</th></tr></thead>
        <tbody>${expenseRows}</tbody>
      </table>

      <h3 style="margin:22px 0 7px;color:#1e40af">Front Desk Notes</h3>
      <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:8px;font-size:13px">${safe(report.report_notes || "No additional notes.")}</div>

      <p style="margin-top:24px;font-size:11px;color:#94a3b8">Sent manually from OptoCare EMR by an authorized clinic user.</p>
    `;

    const result = await sendEmail({
      to: recipient,
      subject,
      html,
      emailType: "daily_front_desk_report",
      clinicId: report.clinic_id,
      clinicName: clinic.name,
      clinicLogo: clinic.logo_url,
      primaryColor: clinic.theme_color,
      preheader: `Daily front desk report for ${clinic.name} — ${report.report_date}`,
      maxAttempts: 3,
    });

    if (!result.ok) return json({ error: result.error || "Report email failed" }, 502);

    const { data: updated, error: updateError } = await admin
      .from("daily_front_desk_reports")
      .update({
        email_sent_at: new Date().toISOString(),
        email_sent_by: userData.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", report.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return json({
      ok: true,
      recipient,
      message_id: result.messageId || null,
      report: updated,
    });
  } catch (error: any) {
    console.error("send-daily-front-desk-report:", error);
    return json({ error: error?.message || "Unexpected error" }, 500);
  }
});
