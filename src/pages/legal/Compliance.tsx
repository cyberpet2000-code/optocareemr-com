import LegalLayout from "./LegalLayout";

export default function Compliance() {
  return (
    <LegalLayout title="Privacy & Regulatory Compliance" description="The shared-responsibility approach to privacy, healthcare and information-security obligations.">
      <p><strong>Version 1.0 · Effective date: [TO BE INSERTED].</strong></p>
      <h2>1. Shared Responsibility</h2>
      <p>OptoCare provides technology and security controls; each clinic remains responsible for the laws and professional rules governing its own practice, patients, employees, records, consent processes and clinical services.</p>
      <h2>2. Nigerian Data Protection</h2>
      <p>OptoCare is designed to support responsible handling of personal information and contractual processor obligations. Applicable requirements depend on the parties, processing activities, data subjects and circumstances. Customers should obtain professional advice for their own obligations.</p>
      <h2>3. HIPAA and GDPR</h2>
      <p>OptoCare may use controls aligned with recognised privacy and security principles, but this website does not constitute a HIPAA certification, GDPR certification, or guarantee that a Customer is compliant with those regimes. Applicability must be assessed based on the Customer's circumstances.</p>
      <h2>4. No Certification Claim</h2>
      <p>Use of OptoCare-EMR does not by itself make a clinic compliant with any law, standard or professional rule. Compliance depends on configuration, policies, staff behaviour, patient communications and other organisational measures.</p>
    </LegalLayout>
  );
}
