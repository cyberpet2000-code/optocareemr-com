// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import {
  BlobWriter,
  ZipWriter,
  TextReader,
  Uint8ArrayReader,
} from "npm:@zip.js/zip.js@2.7.45";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "clinic-archives";

type Scope = "full" | "patient" | "date_range";

interface RequestBody {
  clinic_id: string;
  scope: Scope;
  patient_id?: string;
  date_from?: string;
  date_to?: string;
  password?: string;
}

// ---------- PDF generation ----------
async function renderTextPdf(title: string, body: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const bold = await pdf.embedFont(StandardFonts.CourierBold);
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 50;
  const fontSize = 9.5;
  const lineH = 12.5;
  const maxChars = 88;

  const wrap = (s: string): string[] => {
    const out: string[] = [];
    for (const raw of s.split("\n")) {
      if (raw.length <= maxChars) { out.push(raw); continue; }
      let line = "";
      for (const word of raw.split(" ")) {
        if ((line + " " + word).trim().length > maxChars) {
          out.push(line); line = word;
        } else line = (line ? line + " " : "") + word;
      }
      if (line) out.push(line);
    }
    return out;
  };

  const lines = wrap(body);
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  // header strip
  page.drawRectangle({ x: 0, y: pageH - 36, width: pageW, height: 36, color: rgb(0.06, 0.45, 0.74) });
  page.drawText("OptoCare-EMR Archive", { x: margin, y: pageH - 24, size: 12, font: titleFont, color: rgb(1, 1, 1) });
  page.drawText(title, { x: margin, y: pageH - 60, size: 14, font: titleFont, color: rgb(0.08, 0.12, 0.2) });
  y = pageH - 90;

  for (const line of lines) {
    if (y < margin + lineH) {
      page = pdf.addPage([pageW, pageH]);
      page.drawRectangle({ x: 0, y: pageH - 36, width: pageW, height: 36, color: rgb(0.06, 0.45, 0.74) });
      page.drawText("OptoCare-EMR Archive", { x: margin, y: pageH - 24, size: 12, font: titleFont, color: rgb(1, 1, 1) });
      y = pageH - margin - 20;
    }
    const isHeading = /^-{2,}|^={2,}|^[A-Z][A-Z \-/]+:?$/.test(line.trim()) && line.trim().length < 60;
    page.drawText(line, { x: margin, y, size: fontSize, font: isHeading ? bold : font, color: rgb(0.1, 0.12, 0.18) });
    y -= lineH;
  }

  // footer
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${pages.length}  •  Generated ${new Date().toISOString().slice(0,10)}`, {
      x: margin, y: 24, size: 8, font, color: rgb(0.45, 0.5, 0.6),
    });
  });

  return await pdf.save();
}

// ---------- Patient text body (reuses visitPdf format) ----------
function patientBody(patient: any, visits: any[], billings: any[], hmoClaims: any[]): string {
  const lines: string[] = [];
  const add = (label: string, value: any) => { if (value !== null && value !== undefined && value !== "") lines.push(`${label}: ${value}`); };

  lines.push("================================================================");
  lines.push("                      PATIENT MEDICAL RECORD");
  lines.push("================================================================");
  lines.push("");
  add("Patient Name", patient.full_name);
  add("Patient No", patient.patient_number);
  add("Age", patient.age);
  add("Gender", patient.gender);
  add("Phone", patient.phone);
  add("Email", patient.email);
  add("Address", patient.address);
  add("Payment Type", patient.payment_type);
  if (patient.payment_type === "hmo") {
    add("HMO Provider", patient.hmo_name);
    add("Enrollee No", patient.enrollee_number);
  }
  add("Registered", patient.created_at);
  lines.push("");
  lines.push("================================================================");
  lines.push(`                VISIT HISTORY  (${visits.length} visits)`);
  lines.push("================================================================");
  for (const v of visits) {
    const d = v.created_at ? new Date(v.created_at).toLocaleDateString() : "—";
    lines.push("");
    lines.push(`---- VISIT: ${d} ----`);
    lines.push("");
    lines.push("VISUAL ACUITY");
    add("  VA Unaided OD", v.va_unaided_od);
    add("  VA Unaided OS", v.va_unaided_os);
    add("  VA Aided OD", v.va_aided_od);
    add("  VA Aided OS", v.va_aided_os);
    add("  Near VA Unaided (OU)", v.va_unaided_near_ou);
    add("  Near VA Aided (OU)", v.va_aided_near_ou);
    add("  Old Lens Prescription", v.old_lens_prescription);
    lines.push("");
    lines.push("HISTORY");
    add("  Chief Complaint", v.chief_complaint);
    add("  History", v.history);
    lines.push("");
    lines.push("EXAMINATION");
    add("  Examination", v.examination);
    add("  IOP OD (mmHg)", v.iop_od);
    add("  IOP OS (mmHg)", v.iop_os);
    add("  IOP Time", v.iop_time);
    lines.push("");
    lines.push("REFRACTION / PRESCRIPTION");
    add("  Sphere OD", v.sph_od); add("  Cylinder OD", v.cyl_od); add("  Axis OD", v.axis_od); add("  Add OD", v.add_od);
    add("  Sphere OS", v.sph_os); add("  Cylinder OS", v.cyl_os); add("  Axis OS", v.axis_os); add("  Add OS", v.add_os);
    add("  PD", v.pd);
    lines.push("");
    lines.push("DIAGNOSIS / TREATMENT");
    add("  Diagnosis", v.diagnosis);
    add("  Treatment", v.treatment);
    add("  Medications", v.medications);
    add("  Doctor Notes", v.notes);
    add("  Doctor", v.doctor_name);
  }

  lines.push("");
  lines.push("================================================================");
  lines.push(`                BILLING HISTORY  (${billings.length})`);
  lines.push("================================================================");
  for (const b of billings) {
    lines.push("");
    add("Invoice", b.invoice_number || b.id);
    add("Date", b.created_at);
    add("Amount", b.total_amount);
    add("Status", b.status);
    add("Payment Method", b.payment_method);
    add("Notes", b.notes);
  }

  lines.push("");
  lines.push("================================================================");
  lines.push(`                HMO CLAIMS  (${hmoClaims.length})`);
  lines.push("================================================================");
  for (const c of hmoClaims) {
    lines.push("");
    add("Claim", c.id);
    add("HMO", c.hmo_name);
    add("Date", c.created_at);
    add("Amount", c.amount);
    add("Status", c.status);
  }

  lines.push("");
  lines.push("================================================================");
  lines.push("Archive generated by OptoCare-EMR");
  lines.push("================================================================");
  return lines.join("\n");
}

function summaryBody(clinic: any, counts: Record<string, number>, scope: Scope, opts: RequestBody) {
  const L: string[] = [];
  L.push("================================================================");
  L.push("                  CLINIC DATA ARCHIVE SUMMARY");
  L.push("================================================================");
  L.push("");
  L.push(`Clinic:        ${clinic.name}`);
  L.push(`Clinic ID:     ${clinic.id}`);
  L.push(`Generated At:  ${new Date().toISOString()}`);
  L.push(`Scope:         ${scope}`);
  if (scope === "patient") L.push(`Patient ID:    ${opts.patient_id}`);
  if (scope === "date_range") L.push(`Date Range:    ${opts.date_from}  →  ${opts.date_to}`);
  L.push("");
  L.push("---- CONTENTS ----");
  for (const [k, v] of Object.entries(counts)) L.push(`  ${k.padEnd(20)} ${v}`);
  L.push("");
  L.push("---- ARCHIVE STRUCTURE ----");
  L.push("  archive_summary.pdf");
  L.push("  patients/<patient>.pdf");
  L.push("  billing/billing.pdf");
  L.push("  inventory/inventory.pdf");
  L.push("  hmo_claims/hmo_claims.pdf");
  L.push("  attachments/   (if any)");
  L.push("");
  L.push("This archive is a complete export of clinic-owned data, prepared on");
  L.push("request of an authorized Super Administrator. Patient data inside is");
  L.push("protected health information (PHI). Handle in accordance with HIPAA,");
  L.push("NDPR and applicable medical data regulations.");
  L.push("");
  L.push("================================================================");
  return L.join("\n");
}

function tableBody(title: string, rows: any[]): string {
  if (!rows.length) return `${title}\n\n(No records)`;
  const L: string[] = [];
  L.push(title);
  L.push("=".repeat(title.length));
  L.push("");
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined || v === "") continue;
      L.push(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
    L.push("  " + "-".repeat(60));
  }
  return L.join("\n");
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    const { data: profile } = await admin.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_super_admin) return json({ error: "Only super admins can generate archives" }, 403);

    const body = (await req.json()) as RequestBody;
    if (!body?.clinic_id || !body?.scope) return json({ error: "clinic_id and scope are required" }, 400);
    if (body.scope === "patient" && !body.patient_id) return json({ error: "patient_id required for patient scope" }, 400);
    if (body.scope === "date_range" && (!body.date_from || !body.date_to)) return json({ error: "date_from/date_to required" }, 400);

    // Ensure bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, { public: false });
    }

    // Create archive row
    const { data: archive, error: insErr } = await admin.from("clinic_archives").insert({
      clinic_id: body.clinic_id,
      generated_by: user.id,
      scope: body.scope,
      patient_id: body.patient_id ?? null,
      date_from: body.date_from ?? null,
      date_to: body.date_to ?? null,
      status: "generating",
      encrypted: !!body.password,
      progress: 5,
    }).select().single();
    if (insErr || !archive) return json({ error: insErr?.message || "Failed to create archive" }, 500);

    const archiveId = archive.id;
    const updateProgress = (p: number) => admin.from("clinic_archives").update({ progress: p }).eq("id", archiveId);

    try {
      const { data: clinic } = await admin.from("clinics").select("*").eq("id", body.clinic_id).single();
      if (!clinic) throw new Error("Clinic not found");

      // ----- fetch data -----
      let patientsQ = admin.from("patients").select("*").eq("clinic_id", body.clinic_id);
      if (body.scope === "patient") patientsQ = patientsQ.eq("id", body.patient_id);
      if (body.scope === "date_range") patientsQ = patientsQ.gte("created_at", body.date_from!).lte("created_at", body.date_to! + "T23:59:59");
      const { data: patients = [] } = await patientsQ;
      await updateProgress(20);

      const patientIds = (patients ?? []).map((p: any) => p.id);
      const inIds = patientIds.length ? patientIds : ["00000000-0000-0000-0000-000000000000"];

      const { data: visits = [] } = await admin.from("visits").select("*").in("patient_id", inIds);
      const { data: billings = [] } = await admin.from("billing").select("*").eq("clinic_id", body.clinic_id).in("patient_id", inIds);
      const { data: hmoClaims = [] } = await admin.from("hmo_claims").select("*").eq("clinic_id", body.clinic_id);
      const { data: inventory = [] } = body.scope === "full" ? await admin.from("inventory").select("*").eq("clinic_id", body.clinic_id) : { data: [] as any[] };
      await updateProgress(45);

      // ----- assemble ZIP -----
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"), {
        password: body.password || undefined,
        encryptionStrength: 3, // AES-256
      });

      const counts: Record<string, number> = {
        patients: patients.length,
        visits: visits.length,
        billing_records: billings.length,
        hmo_claims: hmoClaims.length,
        inventory_items: inventory.length,
      };

      const summary = await renderTextPdf("Archive Summary", summaryBody(clinic, counts, body.scope, body));
      await zipWriter.add("archive_summary.pdf", new Uint8ArrayReader(summary));

      let fileCount = 1;
      let done = 0;
      for (const p of patients ?? []) {
        const pv = (visits ?? []).filter((v: any) => v.patient_id === p.id);
        const pb = (billings ?? []).filter((b: any) => b.patient_id === p.id);
        const pc = (hmoClaims ?? []).filter((c: any) => c.patient_id === p.id);
        const pdf = await renderTextPdf(`Patient: ${p.full_name || p.id}`, patientBody(p, pv, pb, pc));
        const safe = String(p.full_name || p.id).replace(/[^a-z0-9_-]+/gi, "_");
        await zipWriter.add(`patients/${safe}_${p.id.slice(0, 8)}.pdf`, new Uint8ArrayReader(pdf));
        fileCount++;
        done++;
        if (done % 5 === 0) await updateProgress(45 + Math.min(35, Math.round((done / patients.length) * 35)));
      }

      const billingPdf = await renderTextPdf("Billing Records", tableBody("BILLING RECORDS", billings ?? []));
      await zipWriter.add("billing/billing_records.pdf", new Uint8ArrayReader(billingPdf));
      fileCount++;

      const hmoPdf = await renderTextPdf("HMO Claims", tableBody("HMO CLAIMS", hmoClaims ?? []));
      await zipWriter.add("hmo_claims/hmo_claims.pdf", new Uint8ArrayReader(hmoPdf));
      fileCount++;

      if (inventory.length) {
        const invPdf = await renderTextPdf("Inventory", tableBody("INVENTORY", inventory ?? []));
        await zipWriter.add("inventory/inventory.pdf", new Uint8ArrayReader(invPdf));
        fileCount++;
      }

      // attachments placeholder readme
      await zipWriter.add("attachments/README.txt", new TextReader(
        "Place exported attachments here. This OptoCare-EMR archive currently has no binary attachments.",
      ));
      fileCount++;

      await updateProgress(85);
      const zipBlob = await zipWriter.close();
      const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());

      // ----- upload -----
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `${body.clinic_id}/${stamp}_${archiveId}.zip`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, zipBytes, {
        contentType: "application/zip",
        upsert: false,
      });
      if (upErr) throw upErr;

      const expiresAt = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();

      await admin.from("clinic_archives").update({
        status: "ready",
        storage_path: path,
        file_size_bytes: zipBytes.byteLength,
        file_count: fileCount,
        progress: 100,
        expires_at: expiresAt,
      }).eq("id", archiveId);

      return json({ ok: true, archive_id: archiveId, file_size_bytes: zipBytes.byteLength, file_count: fileCount });
    } catch (e: any) {
      await admin.from("clinic_archives").update({
        status: "failed",
        error_message: String(e?.message || e),
      }).eq("id", archiveId);
      return json({ error: e?.message || "Archive failed" }, 500);
    }
  } catch (e: any) {
    return json({ error: e?.message || "Unhandled" }, 500);
  }
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
