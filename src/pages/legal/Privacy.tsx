import LegalLayout from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="How OptoCare-EMR collects, uses, and protects clinic and patient information."
    >
      <p>
        OptoCare-EMR values patient privacy and confidentiality. This policy explains what information we
        collect, how it is used, and the rights you have over your data.
      </p>

      <h2>Information We Collect</h2>

      <h3>Clinic Information</h3>
      <ul>
        <li>Clinic name</li>
        <li>Address</li>
        <li>Contact information</li>
        <li>Staff accounts</li>
      </ul>

      <h3>Patient Information</h3>
      <ul>
        <li>Demographics</li>
        <li>Medical history</li>
        <li>Examination findings</li>
        <li>Refractions</li>
        <li>Prescriptions</li>
        <li>Images and documents</li>
        <li>Billing records</li>
      </ul>

      <h3>Technical Information</h3>
      <ul>
        <li>Device information</li>
        <li>Browser information</li>
        <li>IP addresses</li>
        <li>Usage logs</li>
      </ul>

      <h2>How Information Is Used</h2>
      <p>We use the information collected to:</p>
      <ul>
        <li>Provide EMR services.</li>
        <li>Improve the platform.</li>
        <li>Generate reports and analytics.</li>
        <li>Process subscriptions.</li>
        <li>Provide customer support.</li>
      </ul>

      <h2>Data Security</h2>
      <ul>
        <li>Data is encrypted in transit and at rest.</li>
        <li>Access controls are enforced at the platform and database level.</li>
        <li>Role-based permissions are implemented for every clinic.</li>
        <li>Secure, hardened cloud infrastructure is used to host the service.</li>
      </ul>

      <h2>Data Sharing</h2>
      <p>Patient information is never sold. Information may only be shared:</p>
      <ul>
        <li>With authorized clinic staff.</li>
        <li>With third-party providers required for operation (e.g. hosting, email delivery, payments).</li>
        <li>When required by law or valid legal process.</li>
      </ul>

      <h2>Data Retention</h2>
      <p>
        Clinics control their records. Data is retained while accounts remain active and for reasonable
        backup periods after account closure. Backup retention periods are designed to balance recovery
        needs with privacy.
      </p>

      <h2>Your Rights</h2>
      <p>Users may:</p>
      <ul>
        <li>Access their information.</li>
        <li>Correct inaccuracies.</li>
        <li>Request export of their data.</li>
        <li>Request account deletion where legally permissible.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Privacy questions can be sent to{" "}
        <a href="mailto:support@optocareemr.com">support@optocareemr.com</a>.
      </p>
    </LegalLayout>
  );
}
