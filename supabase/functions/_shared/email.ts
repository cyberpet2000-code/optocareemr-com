// Shared branded HTML + plain-text email scaffolding.
// Hospital-style, minimal links, plain-text fallback.
export const APP_URL = (Deno.env.get("APP_URL") || "https://optocareemr.com").replace(/\/$/, "");
export const SUPPORT_EMAIL = "support@optocareemr.com";
export const BRAND_NAME = "OptoCare EMR";

export function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(h[1-6]|li|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ShellOptions = {
  preheader: string;
  clinic_name?: string | null;
  clinic_logo?: string | null;
  primary_color?: string | null;
  body_html: string;
  category: "transactional" | "onboarding" | "reminder" | "billing" | "summary";
};

export function renderShell(opts: ShellOptions) {
  const brand = opts.primary_color || "#1e40af";
  const clinic = escapeHtml(opts.clinic_name || BRAND_NAME);
  const categoryLabel: Record<string, string> = {
    transactional: "Automated healthcare system message",
    onboarding: "Account onboarding",
    reminder: "Appointment reminder",
    billing: "Billing notice",
    summary: "Daily clinic summary",
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>${escapeHtml(BRAND_NAME)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
      <tr><td style="background:${brand};padding:18px 24px;color:#ffffff">
        <table role="presentation" width="100%"><tr>
          <td style="vertical-align:middle">
            ${opts.clinic_logo ? `<img src="${escapeHtml(opts.clinic_logo)}" alt="" width="36" height="36" style="border-radius:8px;background:#fff;vertical-align:middle;margin-right:10px"/>` : ""}
            <span style="font-weight:700;font-size:16px;vertical-align:middle">${clinic}</span>
          </td>
          <td style="text-align:right;font-size:11px;opacity:.85">${escapeHtml(BRAND_NAME)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px 28px 8px 28px;font-size:14px;line-height:1.6;color:#0f172a">
        ${opts.body_html}
      </td></tr>
      <tr><td style="padding:20px 28px 24px 28px;border-top:1px solid #f1f5f9">
        <p style="margin:0 0 6px;font-size:11px;color:#94a3b8">${escapeHtml(categoryLabel[opts.category] || "Automated message")}</p>
        <p style="margin:0;font-size:11px;color:#94a3b8">
          Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#475569;text-decoration:none">${SUPPORT_EMAIL}</a>.<br/>
          Sent securely by ${escapeHtml(BRAND_NAME)} on behalf of ${clinic}. Please do not reply to this email.
        </p>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:10px;color:#94a3b8">© ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)} · Hospital communication system</p>
  </td></tr>
</table>
</body></html>`;
}

// Warmup limits by day-of-life of the domain. Conservative defaults.
// Override with env EMAIL_DAILY_LIMIT (number) to skip warmup gating.
export function dailyLimitFor(category: string): number {
  const override = Number(Deno.env.get("EMAIL_DAILY_LIMIT") || "");
  if (Number.isFinite(override) && override > 0) return override;
  // Default warmup: keep modest. Operator can raise via env when reputation is built.
  if (category === "summary") return 50;
  if (category === "onboarding") return 50;
  return 100;
}
