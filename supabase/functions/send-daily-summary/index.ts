// send-daily-summary — branded daily clinic report email via Resend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { renderShell, htmlToText, escapeHtml as esc, BRAND_NAME, dailyLimitFor } from "../_shared/email.ts";

const FROM_ADDRESS = Deno.env.get("INVITE_FROM_ADDRESS") || `${BRAND_NAME} <noreply@optocareemr.com>`;
const REPLY_TO = Deno.env.get("INVITE_REPLY_TO") || "support@optocareemr.com";
const TIMEZONE = "Africa/Lagos";
const escapeHtml = esc;

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

function buildBodyHtml(opts: { clinic_name: string; date_label: string; stats: Stats; brand: string }) {
  const { clinic_name, date_label, stats, brand } = opts;
  const card = (label: string, value: string) =>
    `<td style="padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;width:33%">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(label)}</div>
      <div style="font-size:20px;font-weight:700;color:#0f172a;margin-top:4px">${escapeHtml(value)}</div>
    </td>`;
  const drugRows = stats.topDrugs.length
    ? stats.topDrugs.map(d => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">${escapeHtml(d.name)}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #f1f5f9">${d.qty}</td></tr>`).join("")
    : `<tr><td colspan="2" style="padding:6px 0;color:#94a3b8">No prescriptions today</td></tr>`;
  return `
    <h2 style="margin:0 0 4px;font-size:18px;color:${brand}">${escapeHtml(clinic_name)}</h2>
    <p style="margin:0 0 18px;color:#64748b;font-size:13px">Daily Clinic Summary — ${escapeHtml(date_label)}</p>
    <table width="100%" cellspacing="6" cellpadding="0" style="border-collapse:separate"><tr>
      ${card("Patients seen", String(stats.patientsSeen))}
      ${card("New patients", String(stats.newPatients))}
      ${card("Revenue", fmtMoney(stats.revenue))}
    </tr><tr>
      ${card("Outstanding", fmtMoney(stats.outstanding))}
      ${card("Pending appts", String(stats.pendingAppointments))}
      ${card("Follow-ups due", String(stats.followupsDue))}
    </tr></table>

    <h3 style="margin:22px 0 6px;font-size:14px;color:${brand}">HMO activity</h3>
    <table width="100%" style="border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Total claims today</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9"><b>${stats.hmoClaims.total}</b></td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Pending</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9">${stats.hmoClaims.pending}</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Approved</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9">${stats.hmoClaims.approved}</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">Rejected</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9">${stats.hmoClaims.rejected}</td></tr>
    </table>

    <h3 style="margin:22px 0 6px;font-size:14px;color:${brand}">Top prescribed drugs</h3>
    <table width="100%" style="border-collapse:collapse;font-size:13px">${drugRows}</table>

    <h3 style="margin:22px 0 6px;font-size:14px;color:${brand}">System</h3>
    <p style="margin:0;font-size:13px;color:#475569">
      Inventory low-stock items: <b>${stats.inventoryAlerts}</b><br/>
      Active alerts: <b>${stats.alerts}</b>
    </p>
  `;
}

async function sendViaResend(to: string, subject: string, html: string, text: string, tags: { name: string; value: string }[], apiKey: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], reply_to: REPLY_TO, subject, html, text, tags }),
  });
  const txt = await r.text();
  let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  return { ok: r.ok, status: r.status, data };
}

function isPermanent(status: number, body: any): boolean {
  if (status === 400 || status === 403 || status === 422) return true;
  const msg = JSON.stringify(body || "").toLowerCase();
  return /invalid.*email|recipient.*invalid|address.*reject|blocked|suppress|spam/.test(msg);
}

async function processClinic(admin: any, clinic: any, RESEND_API_KEY: string, bounds: ReturnType<typeof lagosDayBoundsUTC>) {
  const stats = await gatherStats(admin, clinic.id, bounds.startISO, bounds.endISO);

  const { data: roleRows } = await admin.from("user_roles")
    .select("user_id, role").eq("clinic_id", clinic.id).in("role", ["admin", "super_admin"]);
  const userIds = [...new Set((roleRows || []).map((r: any) => r.user_id))];

  const recipients: string[] = [];
  for (const uid of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data?.user?.email) recipients.push(data.user.email.toLowerCase());
    } catch {}
  }
  if (recipients.length === 0 && clinic.email) recipients.push(clinic.email.toLowerCase());

  if (recipients.length === 0) {
    await admin.from("notification_logs").insert({
      clinic_id: clinic.id, recipient: "(none)", channel: "email",
      notification_type: "daily_summary", category: "summary",
      subject: "Daily summary", status: "failed",
      error_message: "No admin recipients", attempts: 0,
    });
    return { clinic_id: clinic.id, sent: 0, skipped: true };
  }

  const subject = `Daily Clinic Summary — ${clinic.name} — ${bounds.label}`;
  const brand = clinic.theme_color || "#1e40af";
  const bodyHtml = buildBodyHtml({ clinic_name: clinic.name, date_label: bounds.label, stats, brand });
  const html = renderShell({
    preheader: `Daily summary for ${clinic.name} — ${bounds.label}`,
    clinic_name: clinic.name, clinic_logo: clinic.logo_url, primary_color: brand,
    category: "summary", body_html: bodyHtml,
  });
  const text = htmlToText(html);
  const tags = [
    { name: "category", value: "summary" },
    { name: "type", value: "daily_summary" },
    { name: "clinic_id", value: clinic.id },
  ];

  const limit = dailyLimitFor("summary");
  let sent = 0;

  for (const to of recipients) {
    // Suppression check
    const { data: sup } = await admin.from("email_suppressions").select("reason").eq("email", to).maybeSingle();
    if (sup) {
      await admin.from("notification_logs").insert({
        clinic_id: clinic.id, recipient: to, channel: "email",
        notification_type: "daily_summary", category: "summary", subject,
        status: "suppressed", error_message: `Address suppressed: ${sup.reason}`, attempts: 0,
      });
      continue;
    }

    // Quota
    const { data: q } = await admin.rpc("try_consume_email_quota", { _category: "summary", _limit: limit });
    if (q === null || q === undefined) {
      await admin.from("notification_logs").insert({
        clinic_id: clinic.id, recipient: to, channel: "email",
        notification_type: "daily_summary", category: "summary", subject,
        status: "rate_limited", error_message: `Daily warmup limit (${limit}) reached`, attempts: 0,
      });
      continue;
    }

    let providerId: string | null = null, lastErr: string | null = null, success = false, attempts = 0;
    for (let i = 0; i < 2; i++) {
      attempts = i + 1;
      const res = await sendViaResend(to, subject, html, text, tags, RESEND_API_KEY);
      if (res.ok) { success = true; providerId = res.data?.id ?? null; break; }
      lastErr = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
      if (isPermanent(res.status, res.data)) {
        await admin.from("email_suppressions")
          .upsert({ email: to, reason: "permanent_failure", source: "resend_response", clinic_id: clinic.id, details: res.data }, { onConflict: "email" });
        break;
      }
      if (i < 1) await new Promise(r => setTimeout(r, 1500));
    }
    await admin.from("notification_logs").insert({
      clinic_id: clinic.id, recipient: to, channel: "email",
      notification_type: "daily_summary", category: "summary", subject,
      status: success ? "sent" : "failed",
      provider: "resend", provider_message_id: providerId,
      error_message: success ? null : lastErr, attempts,
      plain_text_included: true,
      metadata: { stats } as any,
      sent_at: new Date().toISOString(),
    });
    if (success) sent++;
  }
  return { clinic_id: clinic.id, sent, recipients: recipients.length };
}

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";


async function sendManualFrontDeskReport(req: Request, admin: any) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { error: "Authentication required", status: 401 };
  const caller = createClient(Deno.env.get("SUPABASE_URL") || "", auth.slice(7).trim());
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return { error: "Authentication required", status: 401 };

  const body = await req.json().catch(() => ({} as any));
  const reportId = typeof body?.report_id === "string" ? body.report_id.trim() : "";
  if (!reportId) return { error: "report_id required", status: 400 };

  const { data: report, error: reportError } = await admin.from("daily_front_desk_reports").select("*").eq("id", reportId).maybeSingle();
  if (reportError || !report) return { error: "Daily report not found", status: 404 };
  if (report.status !== "submitted") return { error: "Submit the daily report before sending it by email", status: 400 };

  const { data: membership, error: membershipError } = await admin.from("user_clinic_memberships")
    .select("user_id,is_active").eq("clinic_id", report.clinic_id).eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (membershipError) return { error: membershipError.message, status: 500 };
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("role,is_super_admin,is_active").eq("id", userData.user.id).maybeSingle();
  if (profileError) return { error: profileError.message, status: 500 };
  const role = String(profile?.role || "").toLowerCase();
  const allowed = (!!membership && profile?.is_active === true && ["receptionist","admin"].includes(role)) ||
    (profile?.is_super_admin === true && profile?.is_active === true);
  if (!allowed) return { error: "Daily report access required", status: 403 };

  const { data: clinic, error: clinicError } = await admin.from("clinics")
    .select("id,name,daily_report_email,logo_url,theme_color").eq("id", report.clinic_id).maybeSingle();
  if (clinicError || !clinic) return { error: "Clinic not found", status: 404 };

  const recipient = String(clinic.daily_report_email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { error: "No valid daily report recipient email is configured", status: 400 };
  }

  const [itemsRes, activitiesRes, expensesRes, financeRes] = await Promise.all([
    admin.from("daily_front_desk_report_items").select("*").eq("report_id", report.id).order("created_at",{ascending:true}),
    admin.from("daily_front_desk_activities").select("*").eq("report_id", report.id).order("created_at",{ascending:true}),
    admin.from("daily_front_desk_expenses").select("*").eq("report_id", report.id).order("created_at",{ascending:true}),
    admin.rpc("get_daily_front_desk_financials",{p_clinic_id:report.clinic_id,p_report_date:report.report_date}),
  ]);
  for (const r of [itemsRes,activitiesRes,expensesRes,financeRes]) if (r.error) return { error:r.error.message, status:500 };

  const items=itemsRes.data||[], activities=activitiesRes.data||[], expenses=expensesRes.data||[];
  const finance=Array.isArray(financeRes.data)?financeRes.data[0]:financeRes.data;
  const money=(v:any)=>"₦"+(Number(v)||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
  const safe=(v:any)=>escapeHtml(String(v??"—"));

  const hmoIds=[...new Set(items.map((x:any)=>x.hmo_claim_id).filter((x:any)=>typeof x==="string"&&x))];
  const {data:claims,error:claimsError}=hmoIds.length
    ? await admin.from("hmo_claims").select("id,service_cost,approved_amount,hmo_request_sent,hmo_request_status,claim_sent,claim_response_status").in("id",hmoIds)
    : {data:[],error:null};
  if(claimsError) return {error:claimsError.message,status:500};
  const claimMap=new Map((claims||[]).map((c:any)=>[c.id,c]));

  const visitIds=[...new Set(items.map((x:any)=>x.visit_id).filter((x:any)=>typeof x==="string"&&x))];
  const {data:visits,error:visitsError}=visitIds.length
    ? await admin.from("visits").select("id,sub_od_sphere,sub_od_cyl,sub_od_axis,sub_os_sphere,sub_os_cyl,sub_os_axis,sub_reading_add,lens_type").in("id",visitIds)
    : {data:[],error:null};
  if(visitsError) return {error:visitsError.message,status:500};
  const visitMap=new Map((visits||[]).map((v:any)=>[v.id,v]));

  const rx=(s:any,c:any,a:any)=>[s,c,a].filter((v:any)=>v!==null&&v!==undefined&&v!=="").map(String).join(" / ")||"—";
  const patientRows=items.length?items.map((p:any)=>{
    const v=p.visit_id?visitMap.get(p.visit_id):null;
    const claim=p.hmo_claim_id?claimMap.get(p.hmo_claim_id):null;
    const hmo=p.patient_type==="hmo"?(claim
      ? `Request: ${claim.hmo_request_sent?"Yes":"No"} · ${safe(claim.hmo_request_status||"Not sent")} · Amount: ${money(Number(claim.approved_amount)>0?claim.approved_amount:claim.service_cost)} · Claim: ${claim.claim_sent?"Sent":"Not sent"} · Response: ${safe(claim.claim_response_status||"Pending")}`
      : `HMO · Amount: ${money(p.hmo_amount_to_claim)}`):"Private";
    const rxText=v?`OD ${safe(rx(v.sub_od_sphere,v.sub_od_cyl,v.sub_od_axis))} · OS ${safe(rx(v.sub_os_sphere,v.sub_os_cyl,v.sub_os_axis))} · ADD ${safe(v.sub_reading_add)} · Lens: ${safe(v.lens_type)}`:"";
    return `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${safe(p.patient_name)}</strong><br/><span style="font-size:11px;color:#64748b">${safe(p.patient_number)} · ${safe(p.patient_type)}</span></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px">${p.glasses_prescription_sent?"Prescription sent":"Prescription not sent"} · Lens: ${safe(p.lens_order_status||"not required")}<br/>${rxText}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px">${hmo}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px">${p.eye_drop_quantity||0} dispensed</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px">${safe(p.remarks)}</td></tr>`;
  }).join(""):'<tr><td colspan="5" style="padding:14px;color:#64748b;text-align:center">No patient entries recorded.</td></tr>';

  const activityRows=activities.length?activities.map((a:any)=>`<tr><td>${safe(a.description)}</td><td>${safe(a.payment_method)}</td><td style="text-align:right">${money(a.amount)}</td></tr>`).join(""):'<tr><td colspan="3">No manually recorded activities.</td></tr>';
  const expenseRows=expenses.length?expenses.map((e:any)=>`<tr><td>${safe(e.description)}</td><td>${safe(e.payment_method)}</td><td style="text-align:right">${money(e.amount)}</td></tr>`).join(""):'<tr><td colspan="3">No expenses recorded.</td></tr>';

  const subject=`Daily Front Desk Report — ${clinic.name} — ${report.report_date}`;
  const html=`<h2 style="margin:0 0 4px;color:#1e40af">${safe(clinic.name)}</h2>
<p style="margin:0 0 18px;color:#64748b">Daily Front Desk Report · ${safe(report.report_date)}</p>
<h3 style="color:#1e40af">Patient-by-Patient Operations</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f8fafc;text-align:left"><th>Patient</th><th>Prescription / Lens</th><th>HMO</th><th>Medication</th><th>Remarks</th></tr></thead><tbody>${patientRows}</tbody></table>
<h3 style="color:#1e40af;margin-top:22px">Financial Summary</h3>
<table style="width:100%;font-size:13px"><tr><td>Cash received</td><td style="text-align:right">${money(finance?.cash_received)}</td></tr><tr><td>Transfer received</td><td style="text-align:right">${money(finance?.transfer_received)}</td></tr><tr><td>POS/Card received</td><td style="text-align:right">${money(finance?.card_received)}</td></tr><tr><td>HMO received</td><td style="text-align:right">${money(finance?.hmo_received)}</td></tr><tr><td><strong>Total income</strong></td><td style="text-align:right"><strong>${money(finance?.total_income)}</strong></td></tr><tr><td>Total expenses</td><td style="text-align:right">${money(finance?.total_expenses)}</td></tr><tr><td><strong>Daily balance</strong></td><td style="text-align:right"><strong>${money(finance?.daily_balance)}</strong></td></tr></table>
<h3 style="color:#1e40af;margin-top:22px">Sales / Other Activities</h3><table style="width:100%;font-size:13px"><tbody>${activityRows}</tbody></table>
<h3 style="color:#1e40af;margin-top:22px">Expenses</h3><table style="width:100%;font-size:13px"><tbody>${expenseRows}</tbody></table>
<h3 style="color:#1e40af;margin-top:22px">Front Desk Notes</h3><div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:10px">${safe(report.report_notes||"No additional notes.")}</div>`;

  const {sendEmail}=await import("../_shared/sendEmail.ts");
  const result=await sendEmail({to:recipient,subject,html,emailType:"daily_front_desk_report",clinicId:report.clinic_id,clinicName:clinic.name,clinicLogo:clinic.logo_url,primaryColor:clinic.theme_color,preheader:`Daily front desk report for ${clinic.name} — ${report.report_date}`,maxAttempts:3});
  if(!result.ok) return {error:result.error||"Report email failed",status:502};

  const {data:updated,error:updateError}=await admin.from("daily_front_desk_reports").update({email_sent_at:new Date().toISOString(),email_sent_by:userData.user.id,updated_at:new Date().toISOString()}).eq("id",report.id).select("*").single();
  if(updateError) return {error:updateError.message,status:500};
  return {ok:true,recipient,message_id:result.messageId||null,report:updated};
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const requestPeek = await req.clone().json().catch(() => ({} as any));
  if (requestPeek?.action === "send_daily_front_desk_report") {
    const result = await sendManualFrontDeskReport(req, admin);
    return json(result, result.status || 200);
  }

  const providedSecret = req.headers.get("x-optocare-internal-secret");
  if (!providedSecret) return json({ error: "Unauthorized" }, 401);
  const { data: expectedSecret, error: secretError } = await admin.rpc("get_optocare_internal_edge_secret");
  if (secretError || !expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

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
