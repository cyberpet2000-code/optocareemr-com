import LegalLayout from "./LegalLayout";

export default function Security() {
  return (
    <LegalLayout
      title="Security Policy"
      description="The technical and operational safeguards that protect clinic and patient data in OptoCare-EMR."
    >
      <h2>Encryption</h2>
      <p>
        Data is protected in transit (TLS) and at rest using industry-standard encryption.
      </p>

      <h2>Authentication</h2>
      <p>
        Accounts are protected by secure password policies and optional two-factor authentication for
        added protection.
      </p>

      <h2>Access Control</h2>
      <p>
        Role-based permissions ensure clinic staff only access the information appropriate to their
        role. Multi-tenant isolation prevents cross-clinic data access.
      </p>

      <h2>Audit Logs</h2>
      <p>
        Key activities are logged for accountability and security review.
      </p>

      <h2>Backups</h2>
      <p>
        Regular backups are maintained to support recovery in the event of system failure or data loss.
      </p>

      <h2>Incident Response</h2>
      <p>
        Security incidents are investigated promptly. Affected clinics are notified, and corrective
        measures are documented and applied.
      </p>

      <h2>Reporting Vulnerabilities</h2>
      <p>
        Suspected security issues can be reported to{" "}
        <a href="mailto:support@optocareemr.com">support@optocareemr.com</a>.
      </p>
    </LegalLayout>
  );
}
