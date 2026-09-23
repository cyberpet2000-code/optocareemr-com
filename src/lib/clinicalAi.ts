import { analyzeClinicalFlags } from "@/lib/clinicalRules";
// OptoCare Clinical AI — secure cloud decision support.
// The browser sends only de-identified clinical findings to /api/clinical-ai.
// The Gemini API key stays server-side in Vercel environment variables.

export type ClinicalAiProgress = {
  text: string;
  progress?: number;
};

export type ClinicalCase = {
  age?: number | null;
  gender?: string | null;
  chiefComplaint?: string | null;
  history?: string | null;
  oldLensPrescription?: string | null;
  vaUnaidedOd?: string | null;
  vaUnaidedOs?: string | null;
  vaUnaidedOu?: string | null;
  vaAidedOd?: string | null;
  vaAidedOs?: string | null;
  vaAidedOu?: string | null;
  autoOdSphere?: string | null;
  autoOdCyl?: string | null;
  autoOdAxis?: string | null;
  autoOsSphere?: string | null;
  autoOsCyl?: string | null;
  autoOsAxis?: string | null;
  subOdSphere?: string | null;
  subOdCyl?: string | null;
  subOdAxis?: string | null;
  subVaOd?: string | null;
  subOsSphere?: string | null;
  subOsCyl?: string | null;
  subOsAxis?: string | null;
  subVaOs?: string | null;
  subReadingAdd?: string | null;
  examination?: string | null;
  iopOd?: string | number | null;
  iopOs?: string | number | null;
  diagnosis?: string | null;
  lensType?: string | null;
  medication?: string | null;
  notes?: string | null;
  previousVisits?: ClinicalCaseHistory[];
};

type ClinicalCaseHistory = {
  id?: string;
  created_at?: string | null;
  chief_complaint?: string | null;
  history?: string | null;
  va_unaided_od?: string | null;
  va_unaided_os?: string | null;
  va_unaided_ou?: string | null;
  va_aided_od?: string | null;
  va_aided_os?: string | null;
  va_aided_ou?: string | null;
  sub_od_sphere?: string | null;
  sub_od_cyl?: string | null;
  sub_od_axis?: string | null;
  sub_va_od?: string | null;
  sub_os_sphere?: string | null;
  sub_os_cyl?: string | null;
  sub_os_axis?: string | null;
  sub_va_os?: string | null;
  sub_reading_add?: string | null;
  examination?: string | null;
  iop_od?: string | number | null;
  iop_os?: string | number | null;
  diagnosis?: string | null;
  lens_type?: string | null;
  medication?: string | null;
  notes?: string | null;
};

export function isClinicalAiSupported() {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.onLine;
}

function clean(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function caseLines(c: ClinicalCase) {
  const fields: Array<[string, unknown]> = [
    ["Age", c.age],
    ["Gender", c.gender],
    ["Chief complaint", c.chiefComplaint],
    ["History", c.history],
    ["Old lens prescription", c.oldLensPrescription],
    ["Unaided VA OD", c.vaUnaidedOd],
    ["Unaided VA OS", c.vaUnaidedOs],
    ["Unaided VA OU", c.vaUnaidedOu],
    ["Aided VA OD", c.vaAidedOd],
    ["Aided VA OS", c.vaAidedOs],
    ["Aided VA OU", c.vaAidedOu],
    ["Auto-refraction OD", [c.autoOdSphere, c.autoOdCyl, c.autoOdAxis].filter(Boolean).join(" / ")],
    ["Auto-refraction OS", [c.autoOsSphere, c.autoOsCyl, c.autoOsAxis].filter(Boolean).join(" / ")],
    ["Subjective refraction OD", [c.subOdSphere, c.subOdCyl, c.subOdAxis].filter(Boolean).join(" / ")],
    ["Subjective refraction OS", [c.subOsSphere, c.subOsCyl, c.subOsAxis].filter(Boolean).join(" / ")],
    ["Subjective VA OD", c.subVaOd],
    ["Subjective VA OS", c.subVaOs],
    ["Near ADD", c.subReadingAdd],
    ["Examination", c.examination],
    ["IOP OD", c.iopOd],
    ["IOP OS", c.iopOs],
    ["Recorded diagnosis", c.diagnosis],
    ["Recorded lens/treatment", c.lensType],
    ["Recorded medication", c.medication],
    ["Notes/advice/referral", c.notes],
  ];

  const currentLines = fields
    .map(([label, value]) => {
      const text = clean(value);
      return text ? `- ${label}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const previous = (c.previousVisits || []).slice(0, 8).map((v, index) => {
    const date = v.created_at ? new Date(v.created_at).toLocaleDateString("en-GB") : "Date not recorded";
    const rxOd = [v.sub_od_sphere, v.sub_od_cyl, v.sub_od_axis].filter(Boolean).join(" / ");
    const rxOs = [v.sub_os_sphere, v.sub_os_cyl, v.sub_os_axis].filter(Boolean).join(" / ");
    return [
      `Visit ${index + 1} (${date})`,
      v.chief_complaint && "Complaint: " + v.chief_complaint,
      v.history && "History: " + v.history,
      (v.va_unaided_od || v.va_unaided_os || v.va_unaided_ou) && "Unaided VA: OD " + (v.va_unaided_od || "—") + ", OS " + (v.va_unaided_os || "—") + ", OU " + (v.va_unaided_ou || "—"),
      (v.va_aided_od || v.va_aided_os || v.va_aided_ou) && "Aided VA: OD " + (v.va_aided_od || "—") + ", OS " + (v.va_aided_os || "—") + ", OU " + (v.va_aided_ou || "—"),
      (rxOd || rxOs) && "Subjective Rx: OD " + (rxOd || "—") + "; OS " + (rxOs || "—"),
      (v.sub_va_od || v.sub_va_os) && "Subjective VA: OD " + (v.sub_va_od || "—") + ", OS " + (v.sub_va_os || "—"),
      v.sub_reading_add && "ADD: " + v.sub_reading_add,
      v.examination && "Exam: " + v.examination,
      (v.iop_od || v.iop_os) && "IOP: OD " + (v.iop_od || "—") + ", OS " + (v.iop_os || "—"),
      v.diagnosis && "Diagnosis: " + v.diagnosis,
      v.lens_type && "Lens/treatment: " + v.lens_type,
      v.medication && "Medication: " + v.medication,
      v.notes && "Notes: " + v.notes,
    ].filter(Boolean).join(" | ");
  });

  return [
    currentLines ? "CURRENT VISIT\n" + currentLines : "",
    previous.length ? "PREVIOUS VISITS (most recent first)\n" + previous.join("\n") : "",
  ].filter(Boolean).join("\n\n");
}

export const SYSTEM_PROMPT = `You are OptoCare Clinical Assistant, an optometry-focused clinical decision-support assistant helping an examining optometrist.

Rules:
- Use only the documented clinical information supplied.
- Never invent findings, history, test results, diagnoses, medications, or contraindications.
- Distinguish documented findings from clinical considerations.
- Differential diagnoses are considerations, never confirmed diagnoses unless already documented by the clinician.
- Prioritize safety-sensitive findings and red flags.
- For reduced visual acuity, distinguish refractive improvement, longstanding reduction/amblyopia considerations, and ocular or neurological pathology that requires exclusion.
- Suggest appropriate additional assessments, management considerations, follow-up, and referral when justified.
- Medication/treatment suggestions are considerations for the examining clinician, not automatic prescriptions.
- When previous visits are provided, identify only documented meaningful trends.
- State important missing information when it affects safe interpretation.
- Never use patient names, phone numbers, enrollee numbers, addresses, or other identifiers.
- Be concise and clinically useful.
- Return plain text with these headings when useful:
Clinical Impression
Consider / Rule Out
Suggested Assessment
Treatment / Management
Follow-up / Referral
Red Flags
Historical Trend
Missing Information
- Normally keep the response below 300 words.
- Do not replace the examining optometrist's clinical judgment.`;

export async function analyzeClinicalCase(
  clinicalCase: ClinicalCase,
  onProgress?: (p: ClinicalAiProgress) => void,
) {
  const clinicalData = caseLines(clinicalCase);
  const deterministicFlags = analyzeClinicalFlags(clinicalCase);
  const safetyFlags = deterministicFlags.length
    ? "\n\nOPTOCARE RULE-BASED SAFETY FLAGS (use these as documented decision-support prompts; do not treat them as diagnoses):\n" +
      deterministicFlags.map((flag) =>
        "- " + flag.severity.toUpperCase() + ": " + flag.title + " — " + flag.detail +
        (flag.actions.length ? " Suggested checks: " + flag.actions.join("; ") : "")
      ).join("\n")
    : "";
  if (!clinicalData) {
    throw new Error("Enter the patient's clinical findings before using Analyze Case.");
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("OptoCare Clinical AI requires an internet connection.");
  }

  const requestData = clinicalData + safetyFlags;

  onProgress?.({ text: "Checking OptoCare clinical safety rules..." });

  onProgress?.({ text: "Sending clinical findings securely to OptoCare AI..." });

  let response: Response;
  try {
    response = await fetch("/api/clinical-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicalData: requestData }),
    });
  } catch {
    throw new Error("OptoCare Clinical AI could not connect to its AI service. Please check your internet connection and try again.");
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "OptoCare Clinical AI could not complete the analysis.",
    );
  }

  const result = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!result) {
    throw new Error("The AI service returned no clinical analysis.");
  }

  onProgress?.({ text: "Clinical analysis ready." });
  return result;
}
