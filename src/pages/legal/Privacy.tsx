import LegalLayout from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" description="How OptoCare processes personal information in connection with OptoCare-EMR.">
      <p><strong>Version 1.0 · Effective date: [TO BE INSERTED] · Legal entity details: pending CAC registration.</strong></p>

      <h2>1. Who We Are</h2>
      <p>OptoCare Technologies operates OptoCare-EMR. Corporate registration number, legal entity type and registered office will be inserted after CAC registration. Privacy and data-protection enquiries may be sent to <a href="mailto:support@optocareemr.com">support@optocareemr.com</a>.</p>

      <h2>2. Roles</h2>
      <p>For patient information entered by a clinic, the clinic will generally determine why and how the information is used and is therefore responsible for its controller obligations. OptoCare generally processes that information on the clinic's instructions to provide the service. For OptoCare's own account, security, billing, support and service-management purposes, OptoCare may act as an independent controller where applicable law permits.</p>

      <h2>3. Information We Process</h2>
      <ul>
        <li>Account and identity information such as name, email, role and contact details.</li>
        <li>Clinic information such as name, address, subscription and configuration details.</li>
        <li>Patient information entered by clinics, which may include identification, contact information, health history, examination findings, refraction, prescriptions, images, documents, billing and HMO information.</li>
        <li>Security and technical information such as device/browser information, IP address, logs, session and diagnostic information.</li>
        <li>Support, feedback and communications submitted to OptoCare.</li>
      </ul>

      <h2>4. Health and Other Sensitive Information</h2>
      <p>Patient records can contain sensitive personal data, including health information. Customers must ensure they have an appropriate lawful basis and required notices or consents for their processing. OptoCare applies technical and organisational safeguards appropriate to the service and applicable law.</p>

      <h2>5. Purposes</h2>
      <p>We process information to provide and secure the platform, authenticate users, support clinic workflows, maintain audit and diagnostic records, process subscriptions, provide customer support, prevent abuse, investigate incidents, improve reliability, and meet legal obligations.</p>

      <h2>6. AI Processing</h2>
      <p>Where an AI feature is enabled, relevant information may be processed to generate summaries or decision-support output. The applicable feature documentation will identify important limitations and any material third-party AI processing. Customers should not use AI output as a substitute for professional clinical review.</p>

      <h2>7. Sharing and Subprocessors</h2>
      <p>We may disclose information to service providers that support hosting, authentication, email, payments, messaging, analytics, monitoring, AI or other infrastructure. We may also disclose information when required by law, to protect rights or safety, or in connection with a lawful corporate transaction. A current subprocessor list should be maintained by OptoCare and made available through the legal centre or by request.</p>

      <h2>8. International Transfers</h2>
      <p>Some service providers or infrastructure may process information outside Nigeria. Where required, OptoCare will use an appropriate lawful transfer mechanism and contractual or organisational safeguards. Customers should consider whether their own professional or regulatory obligations impose additional requirements.</p>

      <h2>9. Retention</h2>
      <p>Customer Data is generally retained while the Customer uses the service and for a limited post-termination period needed for export, dispute handling, security and backup recovery, unless law requires longer retention. OptoCare should apply documented retention schedules rather than retaining personal data indefinitely.</p>

      <h2>10. Security</h2>
      <p>OptoCare uses access controls, tenant-scoping controls, encryption, audit logging, monitoring, backups and other safeguards appropriate to the service. No internet service can guarantee absolute security.</p>

      <h2>11. Data Breach and Incident Response</h2>
      <p>OptoCare maintains an incident-response process. Where a security incident affecting Customer Data requires customer notification under the applicable agreement or law, OptoCare will notify the relevant Customer without undue delay after becoming aware and provide reasonably available information needed for response.</p>

      <h2>12. Rights and Requests</h2>
      <p>Depending on applicable law, individuals may have rights relating to access, correction, deletion, restriction, objection, portability and other forms of control. Requests concerning a clinic's patient records should normally be directed to the clinic because it determines the clinical purpose of processing. OptoCare will provide reasonable assistance where required by its agreement with the clinic.</p>

      <h2>13. Cookies</h2>
      <p>Essential cookies and similar technologies may be required for authentication, security and service operation. Optional analytics or similar technologies should be controlled through the applicable consent mechanism where required. See the Cookie Policy.</p>

      <h2>14. Children's Data</h2>
      <p>OptoCare-EMR may be used by clinics to record care for children. The clinic is responsible for complying with applicable rules concerning children, parental responsibility, consent and professional confidentiality.</p>

      <h2>15. Changes</h2>
      <p>Material changes will be identified by version and effective date and, where required, presented for renewed acceptance.</p>
    </LegalLayout>
  );
}
