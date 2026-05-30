// Minimal text-based visit export (no external PDF lib).
export function generateVisitPdf(patient: any, visit: any) {
  const date = new Date(visit.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const lines: string[] = [];
  const add = (label: string, value: any) => { if (value !== null && value !== undefined && value !== "") lines.push(`${label}: ${value}`); };

  const clinicName =
  patient?.clinic_name ||
  "Clinic";

lines.push("===============================================");
lines.push(`           ${clinicName.toUpperCase()} — VISIT RECORD`);
lines.push("===============================================");
lines.push("");

 
 lines.push(`Patient: ${patient.full_name}`);
  if (patient.payment_type === "hmo") {
  add("HMO Provider", patient.hmo_name);
  add("Enrollee No", patient.enrollee_number);
  }
  add("Age", patient.age);
  add("Gender", patient.gender);
  add("Phone", patient.phone);
  add("Payment Type", patient.payment_type);
  lines.push(`Visit Date: ${date}`);
  lines.push("");
  lines.push("---- VISUAL ACUITY ----");

add(
  "VA Unaided OD",
  visit.va_unaided_od
    ? `${visit.va_unaided_od}${visit.va_unaided_od_ph ? ` (PH: ${visit.va_unaided_od_ph})` : ""}`
    : null
);

add(
  "VA Unaided OS",
  visit.va_unaided_os
    ? `${visit.va_unaided_os}${visit.va_unaided_os_ph ? ` (PH: ${visit.va_unaided_os_ph})` : ""}`
    : null
);

add(
  "VA Aided OD",
  visit.va_aided_od
    ? `${visit.va_aided_od}${visit.va_aided_od_ph ? ` (PH: ${visit.va_aided_od_ph})` : ""}`
    : null
);

add(
  "VA Aided OS",
  visit.va_aided_os
    ? `${visit.va_aided_os}${visit.va_aided_os_ph ? ` (PH: ${visit.va_aided_os_ph})` : ""}`
    : null
);

add("Near VA Unaided (OU)", visit.va_unaided_near_ou);
add("Near VA Aided (OU)", visit.va_aided_near_ou);


  add("Old Lens Prescription", visit.old_lens_prescription);
  lines.push("");
  lines.push("---- HISTORY ----");
  add("Chief Complaint", visit.chief_complaint);
  add("History", visit.history);
  lines.push("");
  lines.push("---- EXAMINATION ----");
  add("Examination", visit.examination);
  add("IOP Time", visit.iop_time ? String(visit.iop_time).slice(0, 5) : null);
  add("IOP OD (mmHg)", visit.iop_od);
  add("IOP OS (mmHg)", visit.iop_os);
  lines.push("");
  lines.push("---- DIAGNOSIS / TREATMENT ----");
  add("Diagnosis", visit.diagnosis);
  add("Treatment", visit.treatment);
  add("Notes", visit.notes);
  lines.push("");
  lines.push("===============================================");
  lines.push("Powered by OptoCare EMR");

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `visit-${(patient.full_name || "patient").replace(/\s+/g, "_")}-${date.replace(/\s+/g, "_")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
