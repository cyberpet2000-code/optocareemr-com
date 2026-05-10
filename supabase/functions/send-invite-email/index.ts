// send-invite-email — branded clinic invite via Resend with retry, suppression
// check, warmup quota, plain-text fallback, and notification_logs entry.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { renderShell, htmlToText, escapeHtml, APP_URL, BRAND_NAME, dailyLimitFor } from "../_shared/email.ts";

const FROM_ADDRESS = Deno.env.get("INVITE_FROM_ADDRESS") || `${BRAND_NAME} <no-reply@optocareemr.com>`;
const REPLY_TO = Deno.env.get("INVITE_REPLY_TO") || "support@optocareemr.com";

function buildBody(opts: { clinic_name: string; role: string; invite_link: string }) {
  return `
    <h1 style="margin:0 0 8px;font-size:20px;color:#1e40af">You're invited to ${escapeHtml(opts.clinic_name)}</h1>
    <p style="margin:0 0 16px;color:#475569">A clinic admin has added you to their team on ${escapeHtml(BRAND_NAME)}.</p>
    <p>Hello,</p>
    <p>You have been invited to join <b>${escapeHtml(opts.clinic_name)}</b> as <b>${escapeHtml(opts.role)}</b>.</p>
    <p>Use the secure link below to set up your account. The link is unique to you and connects you to the right clinic.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${opts.invite_link}" style="background:#1e40af;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Accept invitation</a>
    </p>
    <p style="font-size:12px;color:#64748b">If the button doesn't work, paste this address into your browser:<br/><span style="word-break:break-all">${opts.invite_link}</span></p>
    <p style="font-size:12px;color:#64748b">Secure access notice: this link sets your password and grants you access to clinic data covered by patient confidentiality. Do not share it.</p>
    <p style="font-size:12px;color:#94a3b8;margin-top:24px">If you did not expect this invitation, you can safely ignore this email.</p>
  `;
}

async function sendViaResend(payload: { to: string; subject: string; html: string; text: string; tags: { name: string; value: string }[] }, apiKey: string) {
  const reqBody = {
    from: FROM_ADDRESS,
    to: [payload.to],
    reply_to: REPLY_TO,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    tags: payload.tags,
  };
  console.log("[send-invite-email] → POST https://api.resend.com/emails", { from: FROM_ADDRESS, to: payload.to, subject: payload.subject });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  const text = await r.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (r.ok) {
    console.log("[send-invite-email] ✓ Resend accepted", { status: r.status, id: data?.id });
  } else {
    console.error("[send-invite-email] ✗ Resend error", { status: r.status, body: data });
  }
  return { ok: r.ok, status: r.status, data };
}

// Sender-side / account-level errors — these are NOT recipient failures.
// We must NOT suppress the recipient when these occur (the previous bug).
function isSenderConfigError(status: number, body: any): boolean {
  const msg = JSON.stringify(body || "").toLowerCase();
  return (
    /domain.*not.*verified/.test(msg) ||
    /not.*verified.*domain/.test(msg) ||
    /api.*key/.test(msg) ||
    /unauthorized/.test(msg) ||
    /forbidden.*sender/.test(msg) ||
    /from.*address/.test(msg) ||
    status === 401
  );
}

// Permanent RECIPIENT-level failures — suppress recipient, do not retry.
function isPermanentRecipient(status: number, body: any): boolean {
  if (isSenderConfigError(status, body)) return false;
  const msg = JSON.stringify(body || "").toLowerCase();
  return /invalid.*(email|recipient|to)|recipient.*invalid|address.*reject|blocked|suppress|bounce|spam/.test(msg);
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
    const clinic_logo: string | null = body?.clinic_logo ?? null;
    const primary_color: string | null = body?.primary_color ?? null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Valid email required" }, 400);
    if (!token) return json({ error: "token required" }, 400);

    // AuthZ: service role OR authenticated super_admin/admin
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

    // Suppression check
    const { data: sup } = await admin.from("email_suppressions").select("reason").eq("email", email).maybeSingle();
    if (sup) {
      await admin.from("notification_logs").insert({
        clinic_id, recipient: email, channel: "email",
        notification_type: "invite", category: "onboarding",
        subject: `Invite to ${clinic_name}`,
        status: "suppressed", error_message: `Address suppressed: ${sup.reason}`,
        attempts: 0, plain_text_included: true,
      });
      return json({ ok: false, error: "Recipient is suppressed", reason: sup.reason }, 409);
    }

    // Warmup quota
    const limit = dailyLimitFor("onboarding");
    const { data: q } = await admin.rpc("try_consume_email_quota", { _category: "onboarding", _limit: limit });
    if (q === null || q === undefined) {
      await admin.from("notification_logs").insert({
        clinic_id, recipient: email, channel: "email",
        notification_type: "invite", category: "onboarding",
        subject: `Invite to ${clinic_name}`,
        status: "rate_limited", error_message: `Daily warmup limit (${limit}) reached`,
        attempts: 0, plain_text_included: true,
      });
      return json({ ok: false, error: "Daily email warmup limit reached" }, 429);
    }

    const invite_link = `${APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
    const subject = `You're invited to join ${clinic_name} on ${BRAND_NAME}`;
    const html = renderShell({
      preheader: `Accept your invitation to ${clinic_name}`,
      clinic_name, clinic_logo, primary_color, category: "onboarding",
      body_html: buildBody({ clinic_name, role, invite_link }),
    });
    const text = htmlToText(html) + `\n\nAccept invitation: ${invite_link}\n`;

    const tags = [
      { name: "category", value: "onboarding" },
      { name: "type", value: "invite" },
      { name: "clinic_id", value: clinic_id || "none" },
    ];

    let lastErr: string | null = null;
    let providerId: string | null = null;
    let attempts = 0;
    let success = false;

    console.log("[send-invite-email] start", { email, clinic_id, clinic_name, role, invite_id });

    for (let i = 0; i < 3; i++) {
      attempts = i + 1;
      try {
        const res = await sendViaResend({ to: email, subject, html, text, tags }, RESEND_API_KEY);
        if (res.ok) { success = true; providerId = res.data?.id ?? null; lastErr = null; break; }
        lastErr = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
        // Sender-config errors are operator problems — surface loudly, don't retry, don't suppress recipient.
        if (isSenderConfigError(res.status, res.data)) {
          console.error("[send-invite-email] SENDER CONFIG ERROR — fix Resend domain/api key. Recipient NOT suppressed.", res.data);
          break;
        }
        if (isPermanentRecipient(res.status, res.data)) {
          await admin.from("email_suppressions")
            .upsert({ email, reason: "permanent_failure", source: "resend_response", clinic_id: clinic_id ?? null, details: res.data }, { onConflict: "email" });
          break;
        }
      } catch (e) {
        lastErr = (e as Error).message;
        console.error("[send-invite-email] fetch threw", lastErr);
      }
      if (i < 2) await new Promise((r) => setTimeout(r, 2000));
    }

    console.log("[send-invite-email] done", { success, attempts, providerId, lastErr });

    // Backwards-compat: keep email_logs entry
    await admin.from("email_logs").insert({
      email, clinic_id: clinic_id ?? null, invite_id: invite_id ?? null,
      clinic_name, role,
      status: success ? "success" : "failed",
      error: success ? null : lastErr,
      error_message: success ? null : lastErr,
      provider: "resend", provider_message_id: providerId, attempts,
      sent_at: new Date().toISOString(),
    } as any);

    await admin.from("notification_logs").insert({
      clinic_id: clinic_id ?? null, recipient: email, channel: "email",
      notification_type: "invite", category: "onboarding", subject,
      status: success ? "sent" : "failed",
      provider: "resend", provider_message_id: providerId,
      error_message: success ? null : lastErr, attempts,
      plain_text_included: true,
      metadata: { role, clinic_name } as any,
      sent_at: new Date().toISOString(),
    });

    if (!success) return json({ ok: false, error: lastErr, attempts }, 502);
    return json({ ok: true, provider_message_id: providerId, attempts });
  } catch (e) {
    console.error("send-invite-email fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
