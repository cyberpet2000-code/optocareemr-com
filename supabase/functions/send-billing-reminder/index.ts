// send-billing-reminder — subscription/payment reminder email.
// Auth: super_admin or clinic admin of the target clinic; or service-role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { sendEmail } from "../_shared/sendEmail.ts";
import { APP_URL, BRAND_NAME, escapeHtml } from "../_shared/email.ts";

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
    const clinic_id: string | undefined = body?.clinic_id;
    const clinic_name: string = (body?.clinic_name || "Your clinic").toString();
    const reason: string = (body?.reason || "trial_expiring").toString(); // trial_expiring | payment_due | deactivated | reactivated
    const due_date: string | undefined = body?.due_date;
    const amount: string | undefined = body?.amount;
    if (!to) return json({ error: "to required" }, 400);

    const authHeader = req.headers.get("Authorization");
    const isService = !authHeader || authHeader === `Bearer ${SERVICE_KEY}`;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader! } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role, clinic_id").eq("user_id", u.user.id);
      const isSuper = (roles || []).some((r: any) => r.role === "super_admin");
      const isClinicAdmin = clinic_id && (roles || []).some((r: any) => r.role === "admin" && r.clinic_id === clinic_id);
      if (!isSuper && !isClinicAdmin) return json({ error: "Forbidden" }, 403);
    }

    const titles: Record<string, string> = {
      trial_expiring: "Your trial is ending soon",
      payment_due: "Payment reminder",
      deactivated: "Your clinic has been deactivated",
      reactivated: "Your clinic is active again",
    };
    const intros: Record<string, string> = {
      trial_expiring: "Your free trial is ending soon. Activate your subscription to keep uninterrupted access.",
      payment_due: "We have a pending payment on your account. Please complete it to avoid service interruption.",
      deactivated: "Your clinic workspace has been deactivated due to billing. Reactivate anytime by completing payment.",
      reactivated: "Good news — your clinic workspace is active again and your team can resume work.",
    };
    const title = titles[reason] || "Billing notice";
    const intro = intros[reason] || "We're reaching out about your subscription.";
    const billingUrl = `${APP_URL}/billing`;

    const html = `
      <h1 style="margin:0 0 8px;font-size:20px;color:#1e40af">${escapeHtml(title)}</h1>
      <p style="margin:0 0 16px;color:#475569">${escapeHtml(BRAND_NAME)} subscription notice for ${escapeHtml(clinic_name)}.</p>
      <p>${escapeHtml(intro)}</p>
      ${due_date || amount ? `
      <table style="border-collapse:collapse;margin:14px 0">
        ${due_date ? `<tr><td style="padding:6px 12px;color:#64748b">Due date</td><td style="padding:6px 12px;font-weight:600">${escapeHtml(due_date)}</td></tr>` : ""}
        ${amount ? `<tr><td style="padding:6px 12px;color:#64748b">Amount</td><td style="padding:6px 12px;font-weight:600">${escapeHtml(amount)}</td></tr>` : ""}
      </table>` : ""}
      <p style="text-align:center;margin:28px 0">
        <a href="${billingUrl}" style="background:#1e40af;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Manage billing</a>
      </p>
      <p style="font-size:12px;color:#64748b">Need help? Reply to this email or contact support@optocareemr.com.</p>
    `;

    const result = await sendEmail({
      to,
      subject: `${title} — ${clinic_name}`,
      html,
      emailType: reason === "deactivated" || reason === "reactivated" ? "subscription_notice" : "billing_reminder",
      clinicId: clinic_id || null,
      clinicName: clinic_name,
      preheader: title,
    });

    if (!result.ok) return json({ ok: false, error: result.error, logId: result.logId }, result.suppressed ? 409 : 502);
    return json({ ok: true, messageId: result.messageId, logId: result.logId, attempts: result.attempts });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
