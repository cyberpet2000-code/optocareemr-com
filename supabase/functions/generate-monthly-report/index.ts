// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "monthly-reports";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface Body { clinic_id: string; year: number; month: number; send_email?: boolean; }

function sum(rows: any[], f: (r: any) => number) { return rows.reduce((a, r) => a + (Number(f(r)) || 0), 0); }
function groupCount(rows: any[], key: (r: any) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || "Unknown"; m.set(k, (m.get(k) || 0) + 1); }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}
function groupSum(rows: any[], key: (r: any) => string | null | undefined, val: (r: any) => number) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || "Unknown"; m.set(k, (m.get(k) || 0) + (Number(val(r)) || 0)); }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

async function buildPdf(clinicName: string, year: number, month: number, data: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, margin = 50;
  let page = pdf.addPage([W, H]); let y = H - margin;

  const draw = (t: string, size = 10, f = font, color = rgb(0.1,0.12,0.18)) => {
    if (y < margin + 20) { page = pdf.addPage([W, H]); y = H - margin; }
    page.drawText(t, { x: margin, y, size, font: f, color }); y -= size + 4;
  };
  const heading = (t: string) => { y -= 8; draw(t, 13, bold, rgb(0.06,0.35,0.65)); y -= 2; };
  const sub = (t: string) => draw(t, 11, bold);
  const row = (l: string, v: string) => draw(`${l.padEnd(40, ".")} ${v}`, 10);

  // Cover
  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: rgb(0.06, 0.28, 0.58) });
  page.drawText("OptoCare EMR", { x: margin, y: H - 40, size: 18, font: bold, color: rgb(1,1,1) });
  page.drawText("Monthly Clinic Report", { x: margin, y: H - 62, size: 12, font, color: rgb(0.9,0.95,1) });
  page.drawText(`${clinicName} — ${MONTHS[month-1]} ${year}`, { x: margin, y: H - 80, size: 10, font, color: rgb(0.9,0.95,1) });
  y = H - 120;

  heading("Executive Summary");
  row("Total Income", `NGN ${data.income.total.toLocaleString()}`);
  row("Total Expenses", `NGN ${data.expenses.total.toLocaleString()}`);
  row("Net Profit", `NGN ${(data.income.total - data.expenses.total).toLocaleString()}`);
  row("Cash Received", `NGN ${data.income.cashReceived.toLocaleString()}`);
  row("Outstanding Payments", `NGN ${data.income.outstanding.toLocaleString()}`);
  row("Total Patients", String(data.patients.total));
  row("HMO Patients", String(data.patients.hmo));
  row("Private Patients", String(data.patients.private));

  heading("Patient Statistics");
  row("New Patients", String(data.patients.new));
  row("Returning Patients", String(data.patients.returning));
  row("Walk-ins", String(data.patients.walkins));
  row("Consultations", String(data.clinical.consultations));
  row("Refractions", String(data.clinical.refractions));
  row("Follow-ups", String(data.clinical.followups));

  heading("HMO Statistics");
  if (data.hmo.byHmo.length === 0) draw("No HMO activity", 10);
  for (const h of data.hmo.byHmo) {
    sub(h.name);
    row("  Patients", String(h.patients));
    row("  Revenue", `NGN ${h.revenue.toLocaleString()}`);
    row("  Outstanding Claims", String(h.outstanding));
  }

  heading("Financial — Income by Category");
  for (const [k, v] of data.income.byCategory) row(k, `NGN ${v.toLocaleString()}`);

  heading("Financial — Expenses by Category");
  for (const [k, v] of data.expenses.byCategory) row(k, `NGN ${v.toLocaleString()}`);

  heading("Inventory Report");
  row("Inventory Value", `NGN ${data.inventory.value.toLocaleString()}`);
  row("Low Stock Items", String(data.inventory.lowStock));
  row("Out of Stock Items", String(data.inventory.outOfStock));
  sub("Best sellers");
  for (const [k, v] of data.inventory.bestSellers.slice(0, 10)) row(k, `${v} units`);

  heading("Clinical Report");
  sub("Top diagnoses");
  for (const [k, v] of data.clinical.topDiagnoses.slice(0, 10)) row(k, String(v));
  sub("Top medications");
  for (const [k, v] of data.clinical.topMedications.slice(0, 10)) row(k, String(v));

  heading("Performance");
  row("Average patients / day", data.performance.avgPerDay.toFixed(1));
  row("Most active clinician", data.performance.topClinician || "—");

  // Footer on last page
  page.drawText(`Generated by OptoCare EMR on ${new Date().toISOString().slice(0,10)}`, {
    x: margin, y: 20, size: 8, font, color: rgb(0.5,0.5,0.5),
  });

  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json() as Body;
    const { clinic_id, year, month } = body;
    if (!clinic_id || !year || !month) return json({ error: "clinic_id, year, month required" }, 400);

    const from = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const to = new Date(Date.UTC(year, month, 1)).toISOString();
    const fromDate = from.slice(0, 10); const toDate = to.slice(0, 10);

    // Upsert report row as generating
    const { data: existing } = await admin.from("monthly_reports").select("id").eq("clinic_id", clinic_id).eq("year", year).eq("month", month).maybeSingle();
    let reportId = existing?.id;
    if (!reportId) {
      const { data: ins, error } = await admin.from("monthly_reports").insert({ clinic_id, year, month, status: "generating" }).select("id").single();
      if (error) return json({ error: error.message }, 500);
      reportId = ins.id;
    } else {
      await admin.from("monthly_reports").update({ status: "generating", error_message: null }).eq("id", reportId);
    }

    try {
      // Fetch clinic
      const { data: clinic } = await admin.from("clinics").select("id,name,email,finance_email").eq("id", clinic_id).single();
      const clinicName = clinic?.name || "Clinic";

      // Data queries (all scoped by clinic_id)
      const [billing, expenses, patients, visits, inventory, hmoClaims, sales, saleItems] = await Promise.all([
        admin.from("billing").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
        admin.from("expenses").select("*").eq("clinic_id", clinic_id).gte("expense_date", fromDate).lt("expense_date", toDate),
        admin.from("patients").select("id,payment_type,created_at").eq("clinic_id", clinic_id),
        admin.from("visits").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
        admin.from("inventory").select("*").eq("clinic_id", clinic_id),
        admin.from("hmo_claims").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
        admin.from("inventory_sales").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
        admin.from("inventory_sale_items").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
      ]);

      const bRows = billing.data || [];
      const eRows = expenses.data || [];
      const pAll = patients.data || [];
      const pMonth = pAll.filter((p: any) => p.created_at >= from && p.created_at < to);
      const vRows = visits.data || [];
      const iRows = inventory.data || [];
      const hRows = hmoClaims.data || [];
      const siRows = saleItems.data || [];

      const income = {
        total: sum(bRows, r => r.total_amount) + sum(sales.data || [], r => r.total_amount),
        cashReceived: sum(bRows, r => r.amount_paid),
        outstanding: sum(bRows, r => r.balance),
        byCategory: [
          ["Consultation", sum(bRows, r => r.consultation_fee)],
          ["Optical / Items", sum(bRows, r => r.items_total)],
          ["Product Sales", sum(sales.data || [], r => r.total_amount)],
        ] as [string, number][],
      };

      const expensesData = {
        total: sum(eRows, r => r.amount),
        byCategory: groupSum(eRows, r => r.category, r => r.amount),
      };

      const patientsData = {
        total: pMonth.length,
        new: pMonth.length,
        returning: 0,
        walkins: pMonth.filter((p: any) => (p.payment_type || "").toLowerCase() === "walk-in" || (p.payment_type || "").toLowerCase() === "walk_in").length,
        hmo: pMonth.filter((p: any) => (p.payment_type || "").toLowerCase() === "hmo").length,
        private: pMonth.filter((p: any) => (p.payment_type || "").toLowerCase() !== "hmo").length,
      };

      const clinical = {
        consultations: vRows.length,
        refractions: vRows.filter((v: any) => v.refraction_od || v.refraction_os || v.refraction_notes).length,
        followups: vRows.filter((v: any) => v.followup_date).length,
        topDiagnoses: groupCount(vRows, (v: any) => v.diagnosis).slice(0, 10),
        topMedications: groupCount(vRows.flatMap((v: any) => {
          const meds = v.medications;
          if (Array.isArray(meds)) return meds.map((m: any) => ({ name: typeof m === "string" ? m : m?.name }));
          if (typeof meds === "string") return meds.split(/[,;]/).map(s => ({ name: s.trim() }));
          return [];
        }).filter((m: any) => m.name), (m: any) => m.name).slice(0, 10),
      };

      // HMO breakdown
      const hmoMap = new Map<string, { patients: Set<string>, revenue: number, outstanding: number }>();
      for (const c of hRows) {
        const name = c.hmo_name || "Unknown HMO";
        if (!hmoMap.has(name)) hmoMap.set(name, { patients: new Set(), revenue: 0, outstanding: 0 });
        const s = hmoMap.get(name)!;
        if (c.patient_id) s.patients.add(c.patient_id);
        s.revenue += Number(c.approved_amount || 0);
        if (c.status !== "paid") s.outstanding += 1;
      }
      const hmoData = {
        byHmo: Array.from(hmoMap.entries()).map(([name, s]) => ({ name, patients: s.patients.size, revenue: s.revenue, outstanding: s.outstanding })),
      };

      // Inventory
      const invValue = sum(iRows, r => Number(r.stock_quantity || 0) * Number(r.price || 0));
      const bestSellers = groupSum(siRows, (r: any) => {
        const item = iRows.find((i: any) => i.id === r.inventory_id);
        return item?.name || "Unknown";
      }, (r: any) => r.quantity);
      const inventoryData = {
        value: invValue,
        lowStock: iRows.filter((r: any) => (r.stock_quantity ?? 0) > 0 && (r.stock_quantity ?? 0) <= (r.low_stock_threshold ?? r.min_stock ?? 5)).length,
        outOfStock: iRows.filter((r: any) => (r.stock_quantity ?? 0) <= 0).length,
        bestSellers,
      };

      // Performance
      const daysInMonth = new Date(year, month, 0).getDate();
      const perfData = {
        avgPerDay: pMonth.length / daysInMonth,
        topClinician: (groupCount(vRows, (v: any) => v.doctor_name || v.attending_doctor)[0]?.[0]) || null,
      };

      const payload = {
        clinicName, year, month,
        income, expenses: expensesData, patients: patientsData,
        clinical, hmo: hmoData, inventory: inventoryData, performance: perfData,
      };

      const pdfBytes = await buildPdf(clinicName, year, month, payload);
      const path = `${clinic_id}/${year}-${String(month).padStart(2,"0")}-report.pdf`;

      const up = await admin.storage.from(BUCKET).upload(path, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) throw up.error;

      await admin.from("monthly_reports").update({
        status: "ready", storage_path: path, file_size_bytes: pdfBytes.length,
        payload, error_message: null,
      }).eq("id", reportId);

      // Optionally send email
      if (body.send_email !== false) {
        try {
          await admin.functions.invoke("send-monthly-report-email", {
            body: { report_id: reportId },
          });
        } catch (e) { console.error("email invoke failed", e); }
      }

      return json({ ok: true, report_id: reportId, path, size: pdfBytes.length });
    } catch (e: any) {
      await admin.from("monthly_reports").update({ status: "failed", error_message: String(e?.message || e) }).eq("id", reportId);
      return json({ error: e?.message || String(e) }, 500);
    }
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
