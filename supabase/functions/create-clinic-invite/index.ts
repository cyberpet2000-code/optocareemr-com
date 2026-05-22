// Super-admin or clinic admin creates an invite for a clinic and returns a
// shareable link. Structured error responses, CORS-safe, JWT validated in code.
//
// Response shape:
//   2xx -> { ok: true, invite_id, token, link, clinic_name }
//   4xx/5xx -> { ok: false, code, message, details? }
//
// Error codes (stable, mobile-friendly):
//   "unauthorized" | "forbidden" | "invalid_input" | "clinic_not_found"
//   | "invite_failed" | "internal_error"

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-optocare-shared-client",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type ErrCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_input"
  | "clinic_not_found"
  | "invite_failed"
  | "email_failed"
  | "internal_error";

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(code: ErrCode, message: string, status: number, details?: unknown) {
  // ALWAYS 200-safe shape with CORS so "Failed to fetch" never masks a real error.
  return new Response(JSON.stringify({ ok: false, code, message, details }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_ROLES = new Set(["admin", "doctor", "nurse", "receptionist"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonErr("invalid_input", "Method not allowed", 405);
  }

  const reqId = crypto.randomUUID();
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(JSON.stringify({ fn: "create-clinic-invite", reqId, msg, ...extra }));
  const logErr = (msg: string, extra?: Record<string, unknown>) =>
    console.error(JSON.stringify({ fn: "create-clinic-invite", reqId, level: "error", msg, ...extra }));

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const APP_URL = Deno.env.get("APP_URL") || "https://optocareemr.com";

    if (!url || !anon || !serviceKey) {
      logErr("missing env", { hasUrl: !!url, hasAnon: !!anon, hasService: !!serviceKey });
      return jsonErr("internal_error", "Server misconfigured", 500);
    }

    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonErr("unauthorized", "Missing bearer token", 401);
    }
    const token = authHeader.slice("Bearer ".length).trim();

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      logErr("getClaims failed", { error: claimsErr?.message });
      return jsonErr("unauthorized", "Invalid or expired token", 401);
    }
    const callerId = claimsData.claims.sub as string;

    // ── Body ──────────────────────────────────────────────────────────────
    let body: any = {};
    try { body = await req.json(); } catch {
      return jsonErr("invalid_input", "Body must be valid JSON", 400);
    }

    const clinic_id: string | undefined = typeof body?.clinic_id === "string" ? body.clinic_id : undefined;
    const emailRaw: string | undefined = typeof body?.email === "string" ? body.email : undefined;
    const role: string = (body?.role ?? "admin").toString();
    const full_name: string | undefined = body?.full_name
      ? body.full_name.toString().trim() || undefined
      : undefined;

    if (!clinic_id) return jsonErr("invalid_input", "clinic_id is required", 400);
    const email = emailRaw?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return jsonErr("invalid_input", "Valid email required", 400);

    // ── Authorization (super_admin OR clinic admin) ───────────────────────
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerProfile, error: profileErr } = await admin
      .from("profiles")
      .select("is_super_admin, role")
      .eq("id", callerId)
      .maybeSingle();

    if (profileErr) {
      logErr("profile lookup failed", { error: profileErr.message });
      return jsonErr("internal_error", "Failed to verify caller", 500);
    }

    const isSuper =
      !!callerProfile?.is_super_admin || callerProfile?.role === "super_admin";

    let isClinicAdmin = false;
    if (!isSuper) {
      const { data: adminRow, error: roleErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("clinic_id", clinic_id)
        .eq("role", "admin")
        .maybeSingle();
      if (roleErr) {
        logErr("role lookup failed", { error: roleErr.message });
        return jsonErr("internal_error", "Failed to verify clinic role", 500);
      }
      isClinicAdmin = !!adminRow;
    }

    if (!isSuper && !isClinicAdmin) {
      return jsonErr("forbidden", "Only super-admin or clinic admin can invite", 403);
    }

    if (!ALLOWED_ROLES.has(role) && !(isSuper && role === "super_admin")) {
      return jsonErr("invalid_input", `Invalid role: ${role}`, 400);
    }

    // ── Clinic exists ─────────────────────────────────────────────────────
    const { data: clinicRow, error: clinicErr } = await admin
      .from("clinics")
      .select("id, name")
      .eq("id", clinic_id)
      .maybeSingle();
    if (clinicErr) {
      logErr("clinic lookup failed", { error: clinicErr.message });
      return jsonErr("internal_error", "Failed to look up clinic", 500);
    }
    if (!clinicRow) return jsonErr("clinic_not_found", "Clinic not found", 404);

    // ── Generate token + link BEFORE sending so we can include it ────────
    const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const inviteToken = crypto.randomUUID();
    const link = `${APP_URL}/accept-invite?token=${inviteToken}`;

    // ── Send email FIRST. Only persist the invite row if email succeeds ──
    let emailResult: { ok: boolean; status: number; body: any } = { ok: false, status: 0, body: null };
    try {
      const r = await fetch(`${url}/functions/v1/send-invite-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          email,
          clinic_name: clinicRow.name,
          clinic_id,
          role,
          token: inviteToken,
        }),
      });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
      emailResult = { ok: r.ok && parsed?.ok !== false, status: r.status, body: parsed };
      log("send-invite-email result", { status: r.status, ok: emailResult.ok, providerId: parsed?.provider_message_id, error: parsed?.error });
    } catch (e) {
      logErr("send-invite-email fetch threw", { error: (e as Error).message });
      emailResult = { ok: false, status: 0, body: { error: (e as Error).message } };
    }

    if (!emailResult.ok) {
      return jsonErr(
        "email_failed",
        emailResult.body?.error || "Failed to send invitation email",
        502,
        { status: emailResult.status, response: emailResult.body, reqId },
      );
    }

    // ── Email sent — persist the pending invite row ──────────────────────
    const { data: invite, error: invErr } = await admin
      .from("clinic_invites")
      .insert({
        clinic_id,
        email,
        role,
        status: "pending",
        token: inviteToken,
        expires_at,
        invited_by: callerId,
      })
      .select("id, token")
      .single();

    if (invErr || !invite) {
      logErr("invite insert failed AFTER email sent", { error: invErr?.message });
      return jsonErr("invite_failed", invErr?.message ?? "Failed to create invite", 400, invErr);
    }

    // Best-effort activity log — failure must not fail the request.
    admin
      .from("activity_logs")
      .insert({
        user_id: callerId,
        clinic_id,
        action: "invite_sent",
        table_name: "clinic_invites",
        record_id: invite.id,
      })
      .then(({ error: actErr }) => {
        if (actErr) logErr("activity log insert failed", { error: actErr.message });
      });

    log("invite created + emailed", { clinic_id, email, role, full_name, invite_id: invite.id });

    return jsonOk({
      invite_id: invite.id,
      token: invite.token,
      link,
      clinic_name: clinicRow.name,
      email_sent: true,
    });
  } catch (e) {
    logErr("fatal", { error: (e as Error)?.message, stack: (e as Error)?.stack });
    return jsonErr("internal_error", (e as Error)?.message ?? "Unexpected error", 500);
  }
});
