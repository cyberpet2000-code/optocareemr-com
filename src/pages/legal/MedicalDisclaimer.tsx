import LegalLayout from "./LegalLayout";

export default function MedicalDisclaimer() {
  return (
    <LegalLayout
      title="Medical Disclaimer"
      description="OptoCare-EMR supports clinical workflows but does not replace professional medical judgment."
    >
      <p>
        OptoCare-EMR is an electronic medical records and clinic management platform. It supports
        documentation, workflow, and administration of eye care services.
      </p>

      <h2>What OptoCare-EMR Does Not Do</h2>
      <ul>
        <li>Diagnose disease.</li>
        <li>Replace professional medical judgment.</li>
        <li>Make treatment decisions.</li>
      </ul>

      <h2>Responsibility for Care</h2>
      <p>
        Healthcare providers are solely responsible for patient care and clinical decisions. Any
        decision-support, alerts, or AI-driven suggestions in the platform are informational only and
        must be evaluated by a qualified clinician before action is taken.
      </p>
    </LegalLayout>
  );
}
