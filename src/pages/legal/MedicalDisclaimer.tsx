import LegalLayout from "./LegalLayout";

export default function MedicalDisclaimer() {
  return (
    <LegalLayout title="Medical & Clinical Disclaimer" description="Important allocation of responsibility for clinical care and software-assisted workflows.">
      <p><strong>Version 1.0 · Effective date: [TO BE INSERTED].</strong></p>
      <h2>1. Technology, Not Healthcare</h2>
      <p>OptoCare-EMR is software for documentation, workflow and administration. OptoCare does not examine patients, diagnose disease, prescribe treatment or provide healthcare.</p>
      <h2>2. Clinician Responsibility</h2>
      <p>Licensed healthcare professionals remain responsible for obtaining appropriate history, examination, measurements, interpretation, diagnosis, treatment, referral, follow-up and patient communication.</p>
      <h2>3. Data and Calculation Errors</h2>
      <p>Users must verify patient identity, measurements, refraction, prescriptions, calculations, imported information and generated documents before relying on them. The service may contain errors, stale information or incomplete records.</p>
      <h2>4. AI and Alerts</h2>
      <p>AI suggestions, alerts, summaries and other decision-support output are not a diagnosis or treatment instruction. They must be independently reviewed by an appropriately qualified clinician.</p>
      <h2>5. Offline and Connectivity</h2>
      <p>Offline records may not include the latest server-side information until synchronisation completes. Users must apply appropriate clinical safeguards when connectivity is unavailable.</p>
      <h2>6. Emergency Care</h2>
      <p>OptoCare must not be treated as an emergency-care system or the sole source of information for urgent clinical decisions. Follow appropriate clinical and emergency procedures.</p>
    </LegalLayout>
  );
}
