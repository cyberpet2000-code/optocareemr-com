import { CreateMLCEngine, type MLCEngineInterface, type InitProgressReport } from "@mlc-ai/web-llm";

const MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

let enginePromise: Promise<MLCEngineInterface> | null = null;

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
};

export function isClinicalAiSupported() {
  return typeof window !== "undefined" && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}

export function clinicalAiModelId() {
  return MODEL_ID;
}

export async function loadClinicalAi(onProgress?: (p: ClinicalAiProgress) => void) {
  if (!isClinicalAiSupported()) {
    throw new Error("This device/browser does not support WebGPU, which OptoCare AI requires.");
  }

  if (!enginePromise) {
    enginePromise = CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report: InitProgressReport) => {
        onProgress?.({
          text: report.text,
          progress: typeof report.progress === "number" ? report.progress : undefined,
        });
      },
      logLevel: "WARN",
    });
  }

  return enginePromise;
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

  return fields
    .map(([label, value]) => {
      const text = clean(value);
      return text ? `- ${label}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

const SYSTEM_PROMPT = `You are OptoCare Clinical Assistant, an optometry-focused clinical decision-support assistant.

Your task is to help an examining optometrist analyze the clinical information entered in an OptoCare visit.

Rules:
- Be concise, brief, and clinically informative.
- Do not invent findings, history, test results, diagnoses, medications, or contraindications.
- Distinguish documented findings from clinical considerations.
- Suggest relevant differential diagnoses/clinical considerations, additional assessments, treatment considerations, management, follow-up, and referral/red flags when appropriate.
- Treatment and medication suggestions must be framed as considerations for the examining clinician, not automatic prescriptions.
- Do not replace the optometrist's clinical judgment.
- If information is insufficient, say exactly what important information is missing.
- Do not repeat the entire case.
- Prioritize safety and clinically important red flags.
- Do not use the patient's name or identifying information.
- Return plain text with these short headings when applicable:
Clinical Impression
Consider / Rule Out
Suggested Assessment
Treatment / Management
Follow-up / Referral
Red Flags
- Omit headings that have nothing useful to add.
- Keep the total response normally under about 180 words.`;

export async function analyzeClinicalCase(
  clinicalCase: ClinicalCase,
  onProgress?: (p: ClinicalAiProgress) => void,
) {
  const engine = await loadClinicalAi(onProgress);
  const clinicalData = caseLines(clinicalCase);

  if (!clinicalData) {
    throw new Error("Enter the patient's clinical findings before using Analyze Case.");
  }

  const response = await engine.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze this optometry case. Use only the documented information below.\n\n${clinicalData}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 360,
  });

  return response.choices[0]?.message?.content?.trim() || "No clinical analysis was generated.";
}
