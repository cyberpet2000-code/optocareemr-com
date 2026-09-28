import LegalLayout from "./LegalLayout";

export default function Security() {
  return (
    <LegalLayout title="Security & Data Protection" description="The security controls and shared responsibilities applicable to OptoCare-EMR.">
      <p><strong>Version 1.0 · Effective date: [TO BE INSERTED].</strong></p>
      <h2>1. Defence in Depth</h2>
      <p>OptoCare uses layered controls intended to protect confidentiality, integrity and availability, including authentication, role-based access, tenant scoping, database policies, monitoring, logging, backups and controlled privileged operations.</p>
      <h2>2. Encryption</h2>
      <p>Data is protected in transit using TLS. Data-at-rest protection is provided by the underlying infrastructure and service configuration where supported.</p>
      <h2>3. Access Control</h2>
      <p>Access is intended to follow least privilege and clinic membership. Customers are responsible for assigning appropriate staff roles and protecting endpoints.</p>
      <h2>4. Auditability</h2>
      <p>Security-relevant actions may be logged for operational, compliance, troubleshooting and incident-response purposes.</p>
      <h2>5. Backups and Recovery</h2>
      <p>Backups and recovery controls are maintained to support resilience. Backups are not a substitute for Customer export and continuity procedures.</p>
      <h2>6. Incidents</h2>
      <p>Security events are investigated and handled through an incident-response process. Notification obligations are governed by applicable law and the DPA.</p>
      <h2>7. Vulnerability Reporting</h2>
      <p>Suspected vulnerabilities should be reported responsibly to <a href="mailto:support@optocareemr.com">support@optocareemr.com</a>. Do not attempt to access or disclose another clinic's data.</p>
    </LegalLayout>
  );
}
