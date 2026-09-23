import { CreateWebWorkerMLCEngine, prebuiltAppConfig, type MLCEngineInterface, type InitProgressReport } from "@mlc-ai/web-llm";

const MOBILE_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const DESKTOP_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

let enginePromise: Promise<MLCEngineInterface> | null = null;
let engineWorker: Worker | null = null;

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
  sub_os_sphere?: string | null;
  sub_os_cyl?: string | null;
  sub_os_axis?: string | null;
  sub_va_od?: string | null;
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
  return typeof window !== "undefined" && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}

export function clinicalAiModelId() {
  return getClinicalAiModelId();
}

function getClinicalAiModelId() {
  if (typeof window === "undefined") return MOBILE_MODEL_ID;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };

  const isMobile =
    Boolean(nav.userAgentData?.mobile) ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  if (isMobile) return MOBILE_MODEL_ID;

  const memory = nav.deviceMemory;
  const cores = navigator.hardwareConcurrency || 0;
  const capableDesktop = memory === undefined ? cores >= 4 : memory >= 4 || cores >= 6;

  return capableDesktop ? DESKTOP_MODEL_ID : MOBILE_MODEL_ID;
}

function buildAppConfig() {
  const mobileRecord = prebuiltAppConfig.model_list.find(
    (model) => model.model_id === MOBILE_MODEL_ID,
  );
  const desktopRecord = prebuiltAppConfig.model_list.find(
    (model) => model.model_id === DESKTOP_MODEL_ID,
  );

  if (!mobileRecord || !desktopRecord) {
    throw new Error("OptoCare AI model configuration is unavailable in this WebLLM build.");
  }

  // Keep model downloads on the OptoCare origin. Vercel's external
  // rewrites proxy these requests through the OptoCare CDN instead of making
  // the phone/browser connect directly to Hugging Face or raw.githubusercontent.com.
  // This avoids common mobile-network/CORS failures while preserving WebLLM's
  // normal large-file downloads and range requests.
  const supportsOpfs =
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function";

  const proxyOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const proxyModelUrl = (modelUrl: string, modelId: string) => {
    try {
      const parsed = new URL(modelUrl, proxyOrigin || "https://optocareemr.com");
      if (parsed.hostname !== "huggingface.co") return modelUrl;

      const marker = "/resolve/main/";
      const markerIndex = parsed.pathname.indexOf(marker);
      const encodedModelId = encodeURIComponent(modelId);

      if (markerIndex >= 0) {
        const assetPath = parsed.pathname.slice(markerIndex + marker.length);
        const path = assetPath
          ? `/clinical-ai-assets/${encodedModelId}/${assetPath}`
          : `/clinical-ai-assets/${encodedModelId}`;
        return new URL(path, proxyOrigin || "https://optocareemr.com").toString();
      }

      return new URL(
        `/clinical-ai-assets/${encodedModelId}`,
        proxyOrigin || "https://optocareemr.com",
      ).toString();
    } catch {
      return modelUrl;
    }
  };

  const proxyModelLibUrl = (modelLibUrl: string) => {
    try {
      const parsed = new URL(modelLibUrl, proxyOrigin || "https://optocareemr.com");
      if (parsed.hostname !== "raw.githubusercontent.com") return modelLibUrl;
      return new URL(
        `/clinical-ai-lib${parsed.pathname}`,
        proxyOrigin || "https://optocareemr.com",
      ).toString();
    } catch {
      return modelLibUrl;
    }
  };

  const proxyRecord = (record: typeof mobileRecord) => ({
    ...record,
    model: proxyModelUrl(record.model, record.model_id),
    model_lib: proxyModelLibUrl(record.model_lib),
  });

  return {
    model_list: [proxyRecord(mobileRecord), proxyRecord(desktopRecord)],
    cacheBackend: supportsOpfs ? ("opfs" as const) : ("indexeddb" as const),
    ...(supportsOpfs ? { opfsAccessMode: "auto" as const } : {}),
  };
}

export async function loadClinicalAi(onProgress?: (p: ClinicalAiProgress) => void) {
  if (!isClinicalAiSupported()) {
    throw new Error("This device/browser does not support WebGPU, which OptoCare AI requires.");
  }

  if (!enginePromise) {
    enginePromise = (async () => {
      const modelId = getClinicalAiModelId();
      const appConfig = buildAppConfig();

      onProgress?.({
        text: modelId === DESKTOP_MODEL_ID
          ? "Preparing desktop OptoCare AI..."
          : "Preparing mobile OptoCare AI...",
      });
      let lastError: unknown;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          engineWorker = new Worker(new URL("./clinicalAi.worker.ts", import.meta.url), {
            type: "module",
          });

          return await CreateWebWorkerMLCEngine(engineWorker, modelId, {
            appConfig,
            initProgressCallback: (report: InitProgressReport) => {
              onProgress?.({
                text: report.text,
                progress: typeof report.progress === "number" ? report.progress : undefined,
              });
            },
            logLevel: "WARN",
          });
        } catch (error) {
          lastError = error;

          if (attempt < 3) {
            onProgress?.({
              text: "Model download interrupted. Retrying (" + (attempt + 1) + "/3)...",
            });
            await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
          }
        }
      }

      const message = lastError instanceof Error ? lastError.message : "";
      const normalized = message.toLowerCase();

      if (
        normalized.includes("failed to fetch") ||
        normalized.includes("network error") ||
        normalized.includes("networkerror") ||
        normalized.includes("cache") ||
        normalized.includes("unexpected token '<'")
      ) {
        throw new Error(
          "OptoCare AI could not download its local model. Please stay connected to the internet and try again. If the problem continues on Wi-Fi, the model service may be temporarily unavailable.",
        );
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("Unable to load the local OptoCare AI model.");
    })();

    enginePromise.catch(() => {
      // Allow the next Analyze attempt to retry initialization after a failed download.
      enginePromise = null;
      engineWorker?.terminate();
      engineWorker = null;
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
      "Visit " + (index + 1) + " (" + date + ")",
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
- Prioritize safety and clinically important red flags.\n- When previous visits are provided, compare them with the current visit and identify meaningful documented trends or changes. Do not assume a trend when relevant measurements are missing.
- Do not use the patient's name or identifying information.
- Return plain text with these short headings when applicable:
Clinical Impression
Consider / Rule Out
Suggested Assessment
Treatment / Management
Follow-up / Referral
Red Flags
Historical Trend
Missing Information
- Omit headings that have nothing useful to add.
- Never present a differential as a confirmed diagnosis.
- If a safety-sensitive finding is documented, prioritize the assessment needed to confirm or exclude it.
- For reduced VA, explicitly distinguish refractive improvement, longstanding reduction/amblyopia considerations, and findings that require exclusion of ocular or neurological pathology.
- Keep the total response normally under about 220 words.`;

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
        content: `Analyze this optometry case. Use only the documented information below, including previous-visit history when provided.\n\n${clinicalData}`,
      },
    ],
    temperature: 0.15,
    max_tokens: 240,
    enable_thinking: false,
  });

  return response.choices[0]?.message?.content?.trim() || "No clinical analysis was generated.";
}
