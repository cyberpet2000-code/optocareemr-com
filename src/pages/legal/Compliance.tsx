import LegalLayout from "./LegalLayout";

export default function Compliance() {
  return (
    <LegalLayout
      title="HIPAA / GDPR Disclaimer"
      description="OptoCare-EMR's approach to healthcare privacy standards and the shared responsibility model with clinics."
    >
      <p>
        OptoCare-EMR follows healthcare privacy and security best practices aligned with widely
        recognized frameworks such as HIPAA and GDPR.
      </p>

      <h2>Shared Responsibility</h2>
      <p>
        Clinics remain responsible for compliance with local regulations applicable to their practice,
        including patient consent, retention obligations, and reporting requirements.
      </p>

      <h2>Tool, Not Certification</h2>
      <p>
        The software is a tool that supports compliant workflows but does not, by itself, guarantee
        regulatory compliance on behalf of users. Clinics should consult qualified legal counsel for
        compliance advice specific to their jurisdiction.
      </p>
    </LegalLayout>
  );
}
