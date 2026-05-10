// send-password-reset — generates a Supabase recovery link and emails it via the
// centralized sendEmail() utility (Resend). Auth: super_admin/admin or self.
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
    const email: string | undefined = body?.email?.toString().trim().toLowerCase();
    const clinic_id: string | undefined = body?.clinic_id;
    const redirect_to: string = body?.redirect_to || `${APP_URL}/reset-password`;
    if (!email) return json({ error: "email required" }, 400);

    // AuthZ: allow self-request OR authenticated admin/super_admin
    const authHeader = req.headers.get("Authorization");
    let isSelf = false;
    if (authHeader && authHeader !== `Bearer ${SERVICE_KEY}`) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await userClient.auth.getUser();
      if (u?.user?.email?.toLowerCase() === email) isSelf = true;
      else if (u?.user) {
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
        const allowed = (roles || []).some((r: any) => r.role === "super_admin" || r.role === "admin");
        if (!allowed) return json({ error: "Forbidden" }, 403);
      } else {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    // Generate recovery link via Supabase Admin API
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: redirect_to },
    });
    if (linkErr) return json({ error: linkErr.message }, 400);
    const action_link = (linkData as any)?.properties?.action_link || (linkData as any)?.action_link;
    if (!action_link) return json({ error: "Failed to create reset link" }, 500);

    const html = `
      <h1 style="margin:0 0 8px;font-size:20px;color:#1e40af">Reset your password</h1>
      <p style="margin:0 0 16px;color:#475569">A password reset was requested for your ${escapeHtml(BRAND_NAME)} account.</p>
      <p>Click the secure button below to choose a new password. This link will expire shortly for your security.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${action_link}" style="background:#1e40af;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Reset password</a>
      </p>
      <p style="font-size:12px;color:#64748b">If the button doesn't work, paste this address into your browser:<br/><span style="word-break:break-all">${action_link}</span></p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px">If you didn't request this reset, you can safely ignore this email — your password will not change.</p>
    `;

    const result = await sendEmail({
      to: email,
      subject: `Reset your ${BRAND_NAME} password`,
      html,
      emailType: "password_reset",
      clinicId: clinic_id || null,
      preheader: "Reset your OptoCare EMR password",
    });

    if (!result.ok) return json({ ok: false, error: result.error, logId: result.logId }, result.suppressed ? 409 : 502);
    return json({ ok: true, messageId: result.messageId, logId: result.logId, attempts: result.attempts });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
