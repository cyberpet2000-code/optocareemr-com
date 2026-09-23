const MODEL = "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `You are OptoCare Clinical Assistant, an optometry-focused clinical decision-support assistant helping an examining optometrist.

Rules:
- Use only the documented clinical information supplied.
- Never invent findings, history, test results, diagnoses, medications, or contraindications.
- Distinguish documented findings from clinical considerations.
- Differential diagnoses are considerations, never confirmed diagnoses unless already documented by the clinician.
- Prioritize safety-sensitive findings and red flags.
- For reduced visual acuity, distinguish refractive improvement, longstanding reduction/amblyopia considerations, and ocular or neurological pathology that requires exclusion.
- Suggest appropriate additional assessments, management considerations, follow-up, and referral when justified.
- Medication/treatment suggestions are considerations for the examining clinician, not automatic prescriptions.
- Treat the CURRENT VISIT section as current unless the supplied data explicitly says otherwise. Never describe a current examination finding as historical or as coming from a previous visit.
- Treat PREVIOUS VISITS only as historical evidence. Do not move a finding from a previous visit into the current visit unless the current visit also documents it.
- Do not call a VA value BCVA/best-corrected VA unless the supplied field explicitly identifies it as best-corrected. Distinguish unaided, aided, pinhole, and subjective VA when documented.
- Do not convert a clinical consideration into a confirmed diagnosis.
- When previous visits are provided, identify only documented meaningful trends.
- State important missing information when it affects safe interpretation.
- Never request or repeat patient names, phone numbers, enrollee numbers, addresses, or other identifiers.
- Be concise and clinically useful.
- Return a complete report using these headings in this exact order: Clinical Impression, Consider / Rule Out, Suggested Assessment, Treatment / Management, Follow-up / Referral, Red Flags, Historical Trend, Missing Information.
- Normally keep the response below 350 words.
- For a possible optic-disc abnormality, explicitly state that the finding should be confirmed and distinguish papilloedema from pseudopapilloedema/optic neuropathy when clinically justified.
- Do not recommend empiric treatment for a serious differential when confirmation or urgent assessment is required.
- Do not replace the examining optometrist's clinical judgment.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "OptoCare Clinical AI is not configured yet. Add the free Gemini API key to the server environment." });
  }

  const clinicalData = typeof req.body?.clinicalData === "string" ? req.body.clinicalData.trim() : "";
  if (!clinicalData) return res.status(400).json({ error: "No clinical findings were supplied." });
  if (clinicalData.length > 30000) return res.status(413).json({ error: "Clinical case is too large for analysis." });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: "Analyze this de-identified optometry case:\n\n" + clinicalData }] }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 1100,
        },
      }),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = payload?.error?.message;
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
        error: detail ? "OptoCare AI service error: " + detail : "OptoCare AI service could not complete the analysis.",
      });
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
    if (!text) return res.status(502).json({ error: "The AI service returned no clinical analysis." });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ text });
  } catch {
    return res.status(502).json({ error: "OptoCare Clinical AI could not reach the AI service. Please try again." });
  }
}
