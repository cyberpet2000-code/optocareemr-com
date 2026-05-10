// send-appointment-reminder — sends a branded reminder for an upcoming appointment.
// Auth: authenticated clinic member (admin/staff in same clinic) or super_admin/service.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { sendEmail } from "../_shared/sendEmail.ts";
import { BRAND_NAME, escapeHtml } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const to: string | undefined = body?.to?.toString().trim().toLowerCase();
    const patient_name: string = (body?.patient_name || "Patient").toString();
    const appointment_date: string = (body?.appointment_date || "").toString();
    const appointment_time: string = (body?.appointment_time || "").toString();
    const reason: string = (body?.reason || "Consultation").toString();
    const clinic_id: string | undefined = body?.clinic_id;
    const clinic_name: string = (body?.clinic_name || "Your clinic").toString();
    if (!to || !appointment_date) return json({ error: "to and appointment_date required" }, 400);

    // AuthZ: must be in clinic, or super_admin, or service-role
    const authHeader = req.headers.get("Authorization");
    const isService = !authHeader || authHeader === `Bearer ${SERVICE_KEY}`;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader! } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role, clinic_id").eq("user_id", u.user.id);
      const isSuper = (roles || []).some((r: any) => r.role === "super_admin");
      const inClinic = clinic_id && (roles || []).some((r: any) => r.clinic_id === clinic_id);
      if (!isSuper && !inClinic) return json({ error: "Forbidden" }, 403);
    }

    const html = `
      <h1 style="margin:0 0 8px;font-size:20px;color:#1e40af">Appointment reminder</h1>
      <p style="margin:0 0 16px;color:#475569">${escapeHtml(clinic_name)} is reminding you of your upcoming visit.</p>
      <p>Hello ${escapeHtml(patient_name)},</p>
      <p>This is a friendly reminder of your appointment:</p>
      <table style="border-collapse:collapse;margin:14px 0">
        <tr><td style="padding:6px 12px;color:#64748b">Date</td><td style="padding:6px 12px;font-weight:600">${escapeHtml(appointment_date)}</td></tr>
        ${appointment_time ? `<tr><td style="padding:6px 12px;color:#64748b">Time</td><td style="padding:6px 12px;font-weight:600">${escapeHtml(appointment_time)}</td></tr>` : ""}
        <tr><td style="padding:6px 12px;color:#64748b">Reason</td><td style="padding:6px 12px">${escapeHtml(reason)}</td></tr>
        <tr><td style="padding:6px 12px;color:#64748b">Clinic</td><td style="padding:6px 12px">${escapeHtml(clinic_name)}</td></tr>
      </table>
      <p style="font-size:12px;color:#64748b">Please arrive 10 minutes early. If you need to reschedule, contact the clinic directly.</p>
    `;

    const result = await sendEmail({
      to,
      subject: `Reminder: appointment on ${appointment_date}`,
      html,
      emailType: "appointment_reminder",
      clinicId: clinic_id || null,
      clinicName: clinic_name,
      preheader: `Your appointment at ${clinic_name} on ${appointment_date}`,
    });

    if (!result.ok) return json({ ok: false, error: result.error, logId: result.logId }, result.suppressed ? 409 : 502);
    return json({ ok: true, messageId: result.messageId, logId: result.logId, attempts: result.attempts });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
