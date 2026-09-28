import LegalLayout from "./LegalLayout";

export default function Cookies() {
  return (
    <LegalLayout title="Cookie & Similar Technologies Policy" description="How OptoCare uses cookies and similar technologies.">
      <p><strong>Version 1.0 · Effective date: [TO BE INSERTED].</strong></p>
      <h2>1. Essential Technologies</h2>
      <p>Authentication, security, session continuity and core application functions may require cookies or similar storage. Disabling them can prevent the service from working.</p>
      <h2>2. Preferences</h2>
      <p>We may store preferences such as theme, interface settings and selected workspace information to provide a consistent experience.</p>
      <h2>3. Analytics and Performance</h2>
      <p>Where optional analytics or performance tools are enabled, they should be configured in accordance with applicable consent requirements. Providers may process technical identifiers under their own privacy terms.</p>
      <h2>4. Third Parties</h2>
      <p>Third-party infrastructure, payment, analytics or communication services may use their own cookies or similar technologies. Customers should review the relevant provider disclosures where applicable.</p>
      <h2>5. Choices</h2>
      <p>Browser controls and any OptoCare consent controls can be used to manage optional technologies. Essential technologies cannot normally be disabled without affecting core functionality.</p>
    </LegalLayout>
  );
}
