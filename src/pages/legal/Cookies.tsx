import LegalLayout from "./LegalLayout";

export default function Cookies() {
  return (
    <LegalLayout
      title="Cookie Policy"
      description="How OptoCare-EMR uses cookies and similar technologies."
    >
      <p>
        OptoCare-EMR uses cookies and similar technologies to operate and improve the platform.
      </p>

      <h2>How We Use Cookies</h2>
      <ul>
        <li><strong>Authentication</strong> — to keep you securely signed in to your clinic workspace.</li>
        <li><strong>Preferences</strong> — to remember settings such as theme and clinic selection.</li>
        <li><strong>Analytics</strong> — to understand usage patterns and improve features.</li>
        <li><strong>Performance</strong> — to monitor and improve load times and reliability.</li>
      </ul>

      <h2>Managing Cookies</h2>
      <p>
        You may disable cookies in your browser settings. Please note that some features of OptoCare-EMR,
        particularly authentication, may not work properly when cookies are disabled.
      </p>

      <h2>Third-Party Cookies</h2>
      <p>
        Some cookies may be set by trusted third-party services used to operate OptoCare-EMR (for
        example, payment processors and analytics providers). These cookies are governed by the
        respective providers' policies.
      </p>
    </LegalLayout>
  );
}
