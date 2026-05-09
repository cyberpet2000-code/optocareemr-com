// send-invite-email — sends a clinic invite via Resend with retry + logging.
// Callable by other edge functions (service role) or authenticated super_admin/admin users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const APP_URL = (Deno.env.get("APP_URL") || "https://optocareemr.lovable.app").replace(/\/$/, "");
const FROM_ADDRESS = Deno.env.get("INVITE_FROM_ADDRESS") || "OptoCare EMR <noreply@optocareemr.com>";

function buildHtml(opts: { clinic_name: string; role: string; invite_link: string }) {
  const { clinic_name, role, invite_link } = opts;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;padding:24px;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
  <h1 style="margin:0 0 8px;font-size:20px;color:#1e40af">You're invited to ${escapeHtml(clinic_name)}</h1>
  <p style="margin:0 0 16px;color:#475569">on OptoCare EMR</p>
  <p>Hello,</p>
  <p>You have been invited to join <b>${escapeHtml(clinic_name)}</b> as <b>${escapeHtml(role)}</b>.</p>
  <p>Click the button below to accept your invitation:</p>
  <p style="text-align:center;margin:28px 0">
    <a href="${invite_link}" style="background:#1e40af;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Accept invitation</a>
  </p>
  <p style="font-size:13px;color:#64748b">Or copy this link into your browser:<br><span style="word-break:break-all">${invite_link}</span></p>
  <p style="font-size:13px;color:#64748b">This link will create your account, set your password, and grant clinic access.</p>
  <p style="font-size:12px;color:#94a3b8;margin-top:24px">If you did not expect this invitation, you can safely ignore this email.</p>
  <p style="font-size:12px;color:#94a3b8">— OptoCare EMR Team</p>
</div></body></html>`;
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function sendViaResend(payload: { to: string; subject: string; html: string }, apiKey: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [payload.to], subject: payload.subject, html: payload.html }),
  });
  const text = await r.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email?.toString().trim().toLowerCase();
    const clinic_name: string = (body?.clinic_name || "Your clinic").toString();
    const role: string = (body?.role || "admin").toString();
    const token: string | undefined = body?.token;
    const clinic_id: string | undefined = body?.clinic_id;
    const invite_id: string | undefined = body?.invite_id;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Valid email required" }, 400);
    if (!token) return json({ error: "token required" }, 400);

    // AuthZ: allow service-role calls (no auth header) OR authenticated super_admin / admin users
    const authHeader = req.headers.get("Authorization");
    const isServiceCall = !authHeader || authHeader === `Bearer ${SERVICE_KEY}`;
    if (!isServiceCall) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader! } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
      const allowed = (roles || []).some((r: any) => r.role === "super_admin" || r.role === "admin");
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    const invite_link = `${APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
    const subject = `You are invited to join ${clinic_name} on OptoCare EMR`;
    const html = buildHtml({ clinic_name, role, invite_link });

    // Retry: up to 3 attempts (1 initial + 2 retries), 2s between attempts
    let lastErr: string | null = null;
    let providerId: string | null = null;
    let attempts = 0;
    let success = false;

    for (let i = 0; i < 3; i++) {
      attempts = i + 1;
      try {
        const res = await sendViaResend({ to: email, subject, html }, RESEND_API_KEY);
        if (res.ok) { success = true; providerId = res.data?.id ?? null; lastErr = null; break; }
        lastErr = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
        console.warn(`send-invite-email attempt ${attempts} failed`, lastErr);
      } catch (e) {
        lastErr = (e as Error).message;
        console.warn(`send-invite-email attempt ${attempts} threw`, lastErr);
      }
      if (i < 2) await new Promise((r) => setTimeout(r, 2000));
    }

    await admin.from("email_logs").insert({
      email,
      clinic_id: clinic_id ?? null,
      invite_id: invite_id ?? null,
      clinic_name,
      role,
      status: success ? "success" : "failed",
      error: success ? null : lastErr,
      error_message: success ? null : lastErr,
      provider: "resend",
      provider_message_id: providerId,
      attempts,
      sent_at: new Date().toISOString(),
    } as any);

    if (!success) return json({ ok: false, error: lastErr, attempts }, 502);
    return json({ ok: true, provider_message_id: providerId, attempts });
  } catch (e) {
    console.error("send-invite-email fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
