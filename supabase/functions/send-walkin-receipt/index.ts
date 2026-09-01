// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendEmail } from "../_shared/sendEmail.ts";
import { escapeHtml } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  try {
    const caller = createClient(SUPABASE_URL, authorization.replace("Bearer ", ""));
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required" }, 401);

    const body = await req.json();
    const saleId = typeof body?.sale_id === "string" ? body.sale_id.trim() : "";
    const to = typeof body?.to === "string" ? body.to.trim().toLowerCase() : "";
    if (!saleId || !validEmail(to)) return json({ error: "sale_id and a valid recipient email are required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: sale, error: saleError } = await admin
      .from("inventory_sales")
      .select("*")
      .eq("id", saleId)
      .eq("sale_type", "walk_in")
      .maybeSingle();
    if (saleError || !sale) return json({ error: "Walk-in sale not found" }, 404);

    const { data: membership } = await admin
      .from("user_clinic_memberships")
      .select("user_id")
      .eq("clinic_id", sale.clinic_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    const { data: superAdmin } = await admin.rpc("is_platform_super_admin", { uid: userData.user.id });
    if (!membership && !superAdmin) return json({ error: "You do not have access to this clinic" }, 403);

    const [{ data: clinic }, { data: lineRows }] = await Promise.all([
      admin.from("clinics").select("name").eq("id", sale.clinic_id).maybeSingle(),
      admin.from("inventory_sale_items").select("quantity,unit_price,total_price,inventory:inventory(name)").eq("sale_id", sale.id),
    ]);

    const lines = (lineRows || []).map((line: any) => `
      <tr><td style="padding:7px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(line.inventory?.name || "Item")} × ${Number(line.quantity) || 0}</td>
      <td style="padding:7px 0;border-bottom:1px solid #e2e8f0;text-align:right">₦${Number(line.total_price || 0).toLocaleString()}</td></tr>`).join("");
    const total = Number(sale.total_amount || 0);
    const paid = Number(sale.amount_paid || 0);
    const bodyHtml = `
      <h1 style="color:#1e40af;margin:0 0 4px">Walk-In Sale Receipt</h1>
      <p style="color:#475569;margin:0 0 18px">${escapeHtml(clinic?.name || "OptoCare EMR")} · Receipt ${escapeHtml(sale.receipt_number || sale.id)}</p>
      <p style="margin:0 0 14px;color:#475569">Customer: <strong>${escapeHtml(sale.customer_name || "Walk-In Customer")}</strong><br/>${new Date(sale.created_at).toLocaleString()}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${lines}</tbody></table>
      <table style="width:100%;margin-top:12px;font-size:14px"><tbody>
        <tr><td>Subtotal</td><td style="text-align:right">₦${Number(sale.subtotal || 0).toLocaleString()}</td></tr>
        <tr><td>Discount</td><td style="text-align:right">-₦${Number(sale.discount_amount || 0).toLocaleString()}</td></tr>
        <tr><td style="padding-top:8px;font-weight:700">Total</td><td style="padding-top:8px;text-align:right;font-weight:700">₦${total.toLocaleString()}</td></tr>
        <tr><td>Paid (${escapeHtml(sale.payment_method || "Cash")})</td><td style="text-align:right">₦${paid.toLocaleString()}</td></tr>
      </tbody></table>
      <p style="font-size:12px;color:#64748b;margin-top:20px">This was a walk-in inventory sale. No patient record, visit, consultation, or prescription was created.</p>`;

    const result = await sendEmail({
      to,
      subject: `Walk-In Sale Receipt · ${sale.receipt_number || sale.id}`,
      html: bodyHtml,
      emailType: "walkin_receipt",
      clinicId: sale.clinic_id,
      clinicName: clinic?.name,
      preheader: `Receipt ${sale.receipt_number || sale.id}`,
      maxAttempts: 3,
    });
    if (!result.ok) return json({ error: result.error || "Receipt email failed" }, 502);
    return json({ ok: true, message_id: result.messageId });
  } catch (error: any) {
    return json({ error: error?.message || "Unexpected error" }, 500);
  }
});