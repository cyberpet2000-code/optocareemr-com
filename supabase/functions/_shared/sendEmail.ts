// Centralized email sender for OptoCare EMR.
// All edge functions MUST go through sendEmail() — never call Resend directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { renderShell, htmlToText, BRAND_NAME } from "./email.ts";

const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") || `${BRAND_NAME} <no-reply@optocareemr.com>`;
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") || "support@optocareemr.com";

export type EmailType =
  | "invite"
  | "onboarding"
  | "password_reset"
  | "appointment_reminder"
  | "billing_reminder"
  | "subscription_notice"
  | "daily_summary"
  | "walkin_receipt"
  | "system_alert";

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;        // raw inner HTML (will be wrapped in branded shell)
  fullHtml?: string;    // already-wrapped full HTML doc — use as-is
  text?: string;
  emailType: EmailType;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicLogo?: string | null;
  primaryColor?: string | null;
  preheader?: string;
  tags?: { name: string; value: string }[];
  maxAttempts?: number; // default 3
}

export interface SendEmailResult {
  ok: boolean;
  status: number;
  messageId?: string;
  error?: string;
  logId?: string;
  attempts: number;
  suppressed?: boolean;
}

const SHELL_CATEGORY: Record<EmailType, "transactional" | "onboarding" | "reminder" | "billing" | "summary"> = {
  invite: "onboarding",
  onboarding: "onboarding",
  password_reset: "transactional",
  appointment_reminder: "reminder",
  billing_reminder: "billing",
  subscription_notice: "billing",
  daily_summary: "summary",
  walkin_receipt: "billing",
  system_alert: "transactional",
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function postResend(payload: Record<string, unknown>, apiKey: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

function isPermanent(status: number, body: any): boolean {
  if (status === 400 || status === 403 || status === 422) return true;
  const msg = JSON.stringify(body || "").toLowerCase();
  return /invalid.*email|recipient.*invalid|address.*reject|blocked|suppress|spam/.test(msg);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Send a transactional email via Resend with logging, suppression checks, and retries.
 * Always returns a structured result — never throws on send failure.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 500, error: "RESEND_API_KEY not configured", attempts: 0 };
  }

  const to = input.to?.trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, status: 400, error: "Invalid recipient email", attempts: 0 };
  }

  const db = admin();

  // Suppression check
  const { data: sup } = await db
    .from("email_suppressions").select("reason").eq("email", to).maybeSingle();
  if (sup) {
    const { data: log } = await db.from("email_logs").insert({
      email: to,
      subject: input.subject,
      email_type: input.emailType,
      clinic_id: input.clinicId ?? null,
      status: "suppressed",
      error_message: `Suppressed: ${sup.reason}`,
      attempts: 0,
      provider: "resend",
    }).select("id").maybeSingle();
    return { ok: false, status: 409, error: `Recipient suppressed: ${sup.reason}`, suppressed: true, attempts: 0, logId: log?.id };
  }

  // Build HTML
  const fullHtml = input.fullHtml ?? renderShell({
    preheader: input.preheader || input.subject,
    clinic_name: input.clinicName,
    clinic_logo: input.clinicLogo,
    primary_color: input.primaryColor,
    body_html: input.html || "",
    category: SHELL_CATEGORY[input.emailType],
  });
  const text = input.text || htmlToText(fullHtml);

  // Insert pending log row
  const { data: pending } = await db.from("email_logs").insert({
    email: to,
    subject: input.subject,
    email_type: input.emailType,
    clinic_id: input.clinicId ?? null,
    status: "pending",
    attempts: 0,
    provider: "resend",
  }).select("id").maybeSingle();
  const logId = pending?.id as string | undefined;

  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  let attempts = 0;
  let lastErr = "";
  let lastStatus = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const res = await postResend({
      from: FROM_ADDRESS,
      to: [to],
      reply_to: REPLY_TO,
      subject: input.subject,
      html: fullHtml,
      text,
      tags: [
        { name: "type", value: input.emailType },
        ...(input.clinicId ? [{ name: "clinic_id", value: input.clinicId }] : []),
        ...(input.tags || []),
      ],
    }, apiKey);

    lastStatus = res.status;

    if (res.ok) {
      const messageId = res.data?.id as string | undefined;
      if (logId) {
        await db.from("email_logs").update({
          status: "sent",
          attempts,
          provider_message_id: messageId,
          sent_at: new Date().toISOString(),
        }).eq("id", logId);
      }
      return { ok: true, status: 200, messageId, logId, attempts };
    }

    lastErr = typeof res.data === "string" ? res.data : JSON.stringify(res.data);

    if (isPermanent(res.status, res.data)) break;
    if (i < maxAttempts - 1) await sleep(400 * Math.pow(2, i));
  }

  if (logId) {
    await db.from("email_logs").update({
      status: attempts > 1 ? "retried" : "failed",
      attempts,
      error_message: lastErr.slice(0, 1000),
      error: lastErr.slice(0, 1000),
    }).eq("id", logId);
    // Mark final failure
    await db.from("email_logs").update({ status: "failed" }).eq("id", logId);
  }

  return { ok: false, status: lastStatus || 500, error: lastErr, attempts, logId };
}
