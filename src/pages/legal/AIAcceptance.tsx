import LegalLayout from "./LegalLayout";

export default function AIAcceptance() {
  return (
    <LegalLayout title="AI & Clinical Decision-Support Policy" description="Rules and limitations for AI-assisted features in OptoCare-EMR.">
      <p><strong>Version 1.0 · Effective date: [TO BE INSERTED].</strong></p>
      <h2>1. Assistive Function</h2>
      <p>OptoCare AI features are designed to assist documentation, summarisation, pattern review and workflow. They are not autonomous clinical decision-makers.</p>
      <h2>2. Verification Required</h2>
      <p>Clinicians must independently review AI output against the patient's actual record, examination and professional judgment before acting on it.</p>
      <h2>3. No Guarantee of Accuracy</h2>
      <p>AI output can be incomplete, incorrect, misleading or unsuitable for an individual patient. It may also reflect limitations in the information supplied to the system.</p>
      <h2>4. Historical Records</h2>
      <p>Where AI analyses previous visits, users remain responsible for confirming that records are complete, correctly attributed and clinically relevant.</p>
      <h2>5. Patient Safety</h2>
      <p>AI output must not delay emergency assessment, referral or other clinically necessary care.</p>
      <h2>6. Data Protection</h2>
      <p>AI processing remains subject to the applicable Privacy Policy, DPA, security controls and any feature-specific disclosure presented to the user.</p>
    </LegalLayout>
  );
}
