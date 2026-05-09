// send-daily-summary — branded daily clinic report email via Resend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { renderShell, htmlToText, escapeHtml as esc, BRAND_NAME, dailyLimitFor } from "../_shared/email.ts";

const FROM_ADDRESS = Deno.env.get("INVITE_FROM_ADDRESS") || `${BRAND_NAME} <noreply@optocareemr.com>`;
const REPLY_TO = Deno.env.get("INVITE_REPLY_TO") || "support@optocareemr.com";
const TIMEZONE = "Africa/Lagos";

function escapeHtml(s: unknown) { return esc(s); }
const TIMEZONE = "Africa/Lagos";

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtMoney(n: number) {
  return "₦" + (Number(n) || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

// Returns [startUtcISO, endUtcISO] for "today" in Africa/Lagos (UTC+1, no DST).
function lagosDayBoundsUTC(now = new Date()): { startISO: string; endISO: string; label: string } {
  // Africa/Lagos = UTC+1 (no DST). Compute "today" in WAT then convert to UTC.
  const watNow = new Date(now.getTime() + 60 * 60 * 1000);
  const y = watNow.getUTCFullYear();
  const m = watNow.getUTCMonth();
  const d = watNow.getUTCDate();
  const startWat = Date.UTC(y, m, d, 0, 0, 0);
  const endWat = Date.UTC(y, m, d, 23, 59, 59, 999);
  const startUtc = new Date(startWat - 60 * 60 * 1000);
  const endUtc = new Date(endWat - 60 * 60 * 1000);
  const label = new Date(Date.UTC(y, m, d)).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return { startISO: startUtc.toISOString(), endISO: endUtc.toISOString(), label };
}

type Stats = {
  patientsSeen: number;
  newPatients: number;
  revenue: number;
  outstanding: number;
  hmoClaims: { total: number; pending: number; approved: number; rejected: number };
  pendingAppointments: number;
  inventoryAlerts: number;
  followupsDue: number;
  topDrugs: { name: string; qty: number }[];
  alerts: number;
};

async function gatherStats(admin: any, clinic_id: string, startISO: string, endISO: string): Promise<Stats> {
  const safeCount = async (q: any) => {
    const { count, error } = await q;
    if (error) console.warn("count err", error.message);
    return count || 0;
  };

  const [patientsSeen, newPatients, pendingAppointments, inventoryAlerts] = await Promise.all([
    safeCount(admin.from("appointments").select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic_id).gte("appointment_date", startISO.slice(0, 10)).lte("appointment_date", endISO.slice(0, 10))
      .in("status", ["completed", "seen", "done"])),
    safeCount(admin.from("patients").select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic_id).gte("created_at", startISO).lte("created_at", endISO)),
    safeCount(admin.from("appointments").select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic_id).eq("status", "pending")),
    safeCount(admin.from("inventory").select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic_id).lte("stock_quantity", 5)),
  ]);

  const { data: bills } = await admin.from("billing")
    .select("total_amount, amount_paid, balance, status, created_at")
    .eq("clinic_id", clinic_id).gte("created_at", startISO).lte("created_at", endISO);
  const revenue = (bills || []).reduce((s: number, b: any) => s + Number(b.amount_paid || 0), 0);
  const outstanding = (bills || []).reduce((s: number, b: any) => s + Number(b.balance || 0), 0);

  const { data: claims } = await admin.from("hmo_claims")
    .select("status").eq("clinic_id", clinic_id).gte("created_at", startISO).lte("created_at", endISO);
  const hmoClaims = {
    total: (claims || []).length,
    pending: (claims || []).filter((c: any) => /pending/i.test(c.status || "")).length,
    approved: (claims || []).filter((c: any) => /approv/i.test(c.status || "")).length,
    rejected: (claims || []).filter((c: any) => /reject|denied/i.test(c.status || "")).length,
  };

  const followupsDue = await safeCount(admin.from("followups").select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic_id).eq("status", "pending").lte("due_date", endISO.slice(0, 10)));

  const alerts = await safeCount(admin.from("alerts").select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic_id).eq("status", "active"));

  // Top prescribed drugs today (best effort across schemas)
  let topDrugs: { name: string; qty: number }[] = [];
  try {
    const { data: items } = await admin.from("billing_items")
      .select("item_name, quantity, item_type, created_at")
      .eq("clinic_id", clinic_id).gte("created_at", startISO).lte("created_at", endISO);
    const map = new Map<string, number>();
    for (const it of items || []) {
      if (!/drug|pharm|med/i.test(it.item_type || "")) continue;
      map.set(it.item_name, (map.get(it.item_name) || 0) + Number(it.quantity || 0));
    }
    topDrugs = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));
  } catch {}

  return { patientsSeen, newPatients, revenue, outstanding, hmoClaims, pendingAppointments, inventoryAlerts, followupsDue, topDrugs, alerts };
}

function buildHtml(opts: { clinic_name: string; logo_url?: string | null; primary_color?: string | null; date_label: string; stats: Stats }) {
  const { clinic_name, logo_url, primary_color, date_label, stats } = opts;
  const brand = primary_color || "#1e40af";
  const card = (label: string, value: string) =>
    `<td style="padding:14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;width:33%">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(label)}</div>
      <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px">${escapeHtml(value)}</div>
    </td>`;
  const drugRows = stats.topDrugs.length
    ? stats.topDrugs.map(d => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">${escapeHtml(d.name)}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #f1f5f9">${d.qty}</td></tr>`).join("")
    : `<tr><td colspan="2" style="padding:6px 0;color:#94a3b8">No prescriptions today</td></tr>`;
  return `<!doctype html><html><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f1f5f9;color:#0f172a">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:${brand};color:#fff;padding:20px 24px;display:flex;align-items:center;gap:12px">
      ${logo_url ? `<img src="${escapeHtml(logo_url)}" alt="" style="width:40px;height:40px;border-radius:8px;background:#fff;object-fit:cover"/>` : ""}
      <div>
        <div style="font-size:18px;font-weight:700">${escapeHtml(clinic_name)}</div>
        <div style="font-size:12px;opacity:.85">Daily Clinic Summary — ${escapeHtml(date_label)}</div>
      </div>
    </div>
    <div style="padding:24px">
      <table width="100%" cellspacing="8" cellpadding="0" style="border-collapse:separate"><tr>
        ${card("Patients seen", String(stats.patientsSeen))}
        ${card("New patients", String(stats.newPatients))}
        ${card("Revenue", fmtMoney(stats.revenue))}
      </tr><tr>
        ${card("Outstanding", fmtMoney(stats.outstanding))}
        ${card("Pending appts", String(stats.pendingAppointments))}
        ${card("Follow-ups due", String(stats.followupsDue))}
      </tr></table>

      <h3 style="margin:24px 0 8px;font-size:14px;color:${brand}">HMO activity</h3>
      <table width="100%" style="border-collapse:collapse;font-size:13px">
        <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Total claims today</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9"><b>${stats.hmoClaims.total}</b></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Pending</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9">${stats.hmoClaims.pending}</td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Approved</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9">${stats.hmoClaims.approved}</td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Rejected</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9">${stats.hmoClaims.rejected}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px;font-size:14px;color:${brand}">Top prescribed drugs</h3>
      <table width="100%" style="border-collapse:collapse;font-size:13px">${drugRows}</table>

      <h3 style="margin:24px 0 8px;font-size:14px;color:${brand}">System</h3>
      <div style="font-size:13px;color:#475569">
        Inventory low-stock items: <b>${stats.inventoryAlerts}</b><br/>
        Active alerts: <b>${stats.alerts}</b>
      </div>

      <p style="margin-top:24px;font-size:12px;color:#94a3b8">
        Generated automatically by OptoCare EMR for ${escapeHtml(clinic_name)}.
        You're receiving this because you are a registered admin.
      </p>
    </div>
  </div>
</div></body></html>`;
}

async function sendViaResend(to: string, subject: string, html: string, apiKey: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });
  const text = await r.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function processClinic(admin: any, clinic: any, RESEND_API_KEY: string, bounds: ReturnType<typeof lagosDayBoundsUTC>) {
  const stats = await gatherStats(admin, clinic.id, bounds.startISO, bounds.endISO);

  // Find admin recipients: user_roles role in (admin, super_admin) for this clinic
  const { data: roleRows } = await admin.from("user_roles")
    .select("user_id, role").eq("clinic_id", clinic.id).in("role", ["admin", "super_admin"]);
  const userIds = [...new Set((roleRows || []).map((r: any) => r.user_id))];

  const recipients: string[] = [];
  for (const uid of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data?.user?.email) recipients.push(data.user.email);
    } catch {}
  }
  // Fallback to clinic email
  if (recipients.length === 0 && clinic.email) recipients.push(clinic.email);

  if (recipients.length === 0) {
    await admin.from("notification_logs").insert({
      clinic_id: clinic.id, recipient: "(none)", channel: "email",
      notification_type: "daily_summary", subject: "Daily summary",
      status: "failed", error_message: "No admin recipients", attempts: 0,
    });
    return { clinic_id: clinic.id, sent: 0, skipped: true };
  }

  const subject = `Daily Clinic Summary — ${clinic.name} — ${bounds.label}`;
  const html = buildHtml({
    clinic_name: clinic.name, logo_url: clinic.logo_url, primary_color: clinic.theme_color,
    date_label: bounds.label, stats,
  });

  let sent = 0;
  for (const to of recipients) {
    let providerId: string | null = null, lastErr: string | null = null, success = false, attempts = 0;
    for (let i = 0; i < 2; i++) {
      attempts = i + 1;
      const res = await sendViaResend(to, subject, html, RESEND_API_KEY);
      if (res.ok) { success = true; providerId = res.data?.id ?? null; break; }
      lastErr = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
      if (i < 1) await new Promise(r => setTimeout(r, 1500));
    }
    await admin.from("notification_logs").insert({
      clinic_id: clinic.id, recipient: to, channel: "email",
      notification_type: "daily_summary", subject,
      status: success ? "sent" : "failed",
      provider: "resend", provider_message_id: providerId,
      error_message: success ? null : lastErr, attempts,
      metadata: { stats } as any,
      sent_at: new Date().toISOString(),
    });
    if (success) sent++;
  }
  return { clinic_id: clinic.id, sent, recipients: recipients.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({} as any));
  const single_clinic_id: string | undefined = body?.clinic_id;
  const bounds = lagosDayBoundsUTC();

  try {
    let clinics: any[] = [];
    if (single_clinic_id) {
      const { data } = await admin.from("clinics").select("id,name,email,logo_url,theme_color,is_active").eq("id", single_clinic_id);
      clinics = data || [];
    } else {
      const { data } = await admin.from("clinics").select("id,name,email,logo_url,theme_color,is_active").eq("is_active", true);
      clinics = data || [];
    }

    const results = [];
    for (const c of clinics) {
      try { results.push(await processClinic(admin, c, RESEND_API_KEY, bounds)); }
      catch (e) { results.push({ clinic_id: c.id, error: (e as Error).message }); }
    }
    return json({ ok: true, processed: results.length, date: bounds.label, results, timezone: TIMEZONE });
  } catch (e) {
    console.error("send-daily-summary fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
