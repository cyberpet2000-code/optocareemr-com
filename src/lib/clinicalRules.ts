import type { ClinicalCase } from "@/lib/clinicalAi";

export type ClinicalFlag = {
  severity: "urgent" | "attention" | "info";
  title: string;
  detail: string;
  actions: string[];
};

const toNum = (v: unknown) => {
  const n = Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const vaScore: Record<string, number> = {
  "6/6": 0, "6/7.5": 1, "6/9": 2, "6/12": 3, "6/18": 4, "6/24": 5,
  "6/30": 6, "6/36": 7, "6/60": 8,
};

function worseThan(value: string | null | undefined, target = 4) {
  const key = String(value ?? "").trim().toLowerCase();
  return vaScore[key] !== undefined && vaScore[key] >= target;
}

export function analyzeClinicalFlags(c: ClinicalCase): ClinicalFlag[] {
  const flags: ClinicalFlag[] = [];
  const od = c.vaAidedOd || c.subVaOd || c.vaUnaidedOd;
  const os = c.vaAidedOs || c.subVaOs || c.vaUnaidedOs;
  const iopOd = toNum(c.iopOd);
  const iopOs = toNum(c.iopOs);
  const exam = String(c.examination ?? "").toLowerCase();
  const history = String(c.history ?? "").toLowerCase();
  const complaint = String(c.chiefComplaint ?? "").toLowerCase();

  if (worseThan(os) && od && os && os !== od) {
    flags.push({
      severity: "attention",
      title: "Reduced OS visual acuity",
      detail: `OS is documented as ${os} compared with OD ${od}. Confirm best-corrected VA and assess whether the reduction is longstanding or new.`,
      actions: ["Repeat refraction/BCVA", "Check pupils/RAPD and colour vision", "Consider OCT macula and optic nerve when clinically indicated"],
    });
  }

  if (/papill?o?edema|disc swelling|swollen disc|optic disc edema|optic disc oedema/.test(exam)) {
    flags.push({
      severity: "urgent",
      title: "Possible optic-disc swelling documented",
      detail: "Do not attribute reduced vision to refractive error or amblyopia alone until true disc oedema versus pseudopapilloedema/other optic neuropathy has been assessed.",
      actions: ["OCT ONH/RNFL + GCC/GCIPL", "Fundus photography", "RAPD and colour vision", "Visual field if reliable", "EDI-OCT/B-scan if drusen is suspected", "Escalate for neuro-ophthalmic assessment if true oedema or neurological red flags are present"],
    });
  }

  if (/(eye movement|movement of eye|moving the eye|painful eye|eye pain)/.test(complaint + " " + history)) {
    flags.push({
      severity: "attention",
      title: "Eye pain recorded",
      detail: "Pain should be characterized, particularly whether it is associated with eye movement, and correlated with colour vision, pupils and visual field findings.",
      actions: ["Ask specifically about pain on eye movement", "Check RAPD", "Check colour vision", "Assess visual field"],
    });
  }

  if (iopOd !== null && iopOs !== null && Math.abs(iopOd - iopOs) >= 5) {
    flags.push({
      severity: "attention",
      title: "Inter-eye IOP asymmetry",
      detail: `Recorded IOP is OD ${iopOd} and OS ${iopOs} mmHg. Interpret with the optic nerve, cornea and clinical context.`,
      actions: ["Repeat/confirm IOP when indicated", "Correlate with optic nerve and visual field findings"],
    });
  }

  if (c.age !== null && c.age !== undefined && c.age <= 18 && worseThan(os) && /always|longstanding|since (child|young)|years|old complaint|previously/.test(history)) {
    flags.push({
      severity: "info",
      title: "Longstanding unilateral reduction may indicate amblyopia",
      detail: "Amblyopia is a clinical consideration when reduced vision has been longstanding and no structural/neurological cause explains it.",
      actions: ["Confirm historical VA", "Ensure appropriate refractive correction", "Reassess BCVA after consistent spectacle wear", "Consider age-appropriate amblyopia therapy if diagnosis is established"],
    });
  }

  if (c.age !== null && c.age !== undefined && c.age <= 18 && (worseThan(os) || worseThan(od))) {
    flags.push({
      severity: "info",
      title: "Paediatric reduced-vision review",
      detail: "In a child/adolescent, document binocular vision, ocular alignment and the history of the weaker eye as part of the reduced-vision assessment.",
      actions: ["Check cover test/alignment", "Assess stereo/binocular function where appropriate", "Review previous VA and spectacle history"],
    });
  }

  return flags;
}
