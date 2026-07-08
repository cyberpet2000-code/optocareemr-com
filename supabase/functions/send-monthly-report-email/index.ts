// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/sendEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { report_id } = await req.json();
    if (!report_id) return json({ error: "report_id required" }, 400);

    const { data: report, error } = await admin.from("monthly_reports").select("*").eq("id", report_id).single();
    if (error || !report) return json({ error: "Report not found" }, 404);
    if (report.status !== "ready" || !report.storage_path) return json({ error: "Report not ready" }, 400);

    const { data: clinic } = await admin.from("clinics").select("name,email,finance_email").eq("id", report.clinic_id).single();

    // Recipients: clinic email, finance_email, all admins/members of the clinic with admin role
    const recipients = new Set<string>();
    if (clinic?.email) recipients.add(clinic.email.toLowerCase());
    if (clinic?.finance_email) recipients.add(clinic.finance_email.toLowerCase());

    const { data: adminUsers } = await admin.from("user_clinic_memberships")
      .select("user_id, profiles!inner(email)")
      .eq("clinic_id", report.clinic_id);
    for (const u of (adminUsers || []) as any[]) {
      const email = u.profiles?.email;
      if (email) recipients.add(String(email).toLowerCase());
    }

    if (recipients.size === 0) return json({ error: "No recipients" }, 400);

    // Signed URL (7 days)
    const { data: signed } = await admin.storage.from("monthly-reports").createSignedUrl(report.storage_path, 60 * 60 * 24 * 7);

    const p = report.payload || {};
    const monthName = MONTHS[report.month - 1];
    const netProfit = (p?.income?.total || 0) - (p?.expenses?.total || 0);
    const subject = `Monthly Clinic Report – ${clinic?.name || "Clinic"} – ${monthName} ${report.year}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a">
        <h1 style="color:#1e3a8a;margin:0 0 8px">${monthName} ${report.year} Report</h1>
        <p style="color:#475569;margin:0 0 16px">${clinic?.name || "Your clinic"}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b">Total Income</td><td style="text-align:right;font-weight:600">₦${(p?.income?.total || 0).toLocaleString()}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Total Expenses</td><td style="text-align:right;font-weight:600">₦${(p?.expenses?.total || 0).toLocaleString()}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Net Profit</td><td style="text-align:right;font-weight:700;color:${netProfit>=0?'#059669':'#dc2626'}">₦${netProfit.toLocaleString()}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Total Patients</td><td style="text-align:right;font-weight:600">${p?.patients?.total || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">HMO Patients</td><td style="text-align:right;font-weight:600">${p?.patients?.hmo || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Cash Received</td><td style="text-align:right;font-weight:600">₦${(p?.income?.cashReceived || 0).toLocaleString()}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Outstanding</td><td style="text-align:right;font-weight:600">₦${(p?.income?.outstanding || 0).toLocaleString()}</td></tr>
        </table>
        ${signed?.signedUrl ? `<p style="margin:24px 0"><a href="${signed.signedUrl}" style="background:#1e40af;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Download full PDF report</a></p>` : ""}
        <p style="font-size:12px;color:#94a3b8;margin-top:24px">Generated automatically by OptoCare EMR.</p>
      </div>
    `;

    const results: { recipient: string; ok: boolean; error?: string }[] = [];
    for (const to of recipients) {
      let attempts = 0; let ok = false; let lastErr: string | undefined;
      while (attempts < 3 && !ok) {
        attempts++;
        try {
          const res = await sendEmail({
            to, subject, html, emailType: "monthly_report", clinicId: report.clinic_id,
            preheader: `${monthName} ${report.year} performance summary`,
          } as any);
          if (res.ok) ok = true; else lastErr = res.error;
        } catch (e: any) { lastErr = e?.message || String(e); }
      }
      await admin.from("report_email_logs").insert({
        clinic_id: report.clinic_id, report_id: report.id, recipient: to,
        report_year: report.year, report_month: report.month,
        status: ok ? "sent" : "failed", retries: attempts - (ok ? 1 : 0),
        error_message: ok ? null : lastErr, sent_at: ok ? new Date().toISOString() : null,
      });
      results.push({ recipient: to, ok, error: ok ? undefined : lastErr });
    }

    return json({ ok: true, results });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
