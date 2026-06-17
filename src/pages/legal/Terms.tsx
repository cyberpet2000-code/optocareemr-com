import LegalLayout from "./LegalLayout";

export default function Terms() {
  return (
    <LegalLayout
      title="Terms & Conditions"
      description="The terms governing your use of OptoCare-EMR, a cloud-based EMR and practice management platform for eye care."
    >
      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using OptoCare-EMR, you agree to be bound by these Terms & Conditions. If you do
        not agree, you may not use the platform.
      </p>

      <h2>2. Eligible Users</h2>
      <p>
        OptoCare-EMR is intended for use by optometrists, ophthalmologists, clinics, hospitals, and their
        authorized staff. Use by individuals outside these categories is not permitted.
      </p>

      <h2>3. User Responsibilities</h2>
      <p>Users are responsible for:</p>
      <ul>
        <li>Maintaining account security at all times.</li>
        <li>Protecting passwords and access credentials.</li>
        <li>Ensuring all information entered into the platform is accurate and up to date.</li>
        <li>Complying with all applicable healthcare regulations in their jurisdiction.</li>
        <li>Maintaining patient confidentiality consistent with professional standards.</li>
      </ul>

      <h2>4. Software as a Service (SaaS)</h2>
      <p>
        OptoCare-EMR is provided as a cloud-based Software as a Service. Users are granted a limited,
        non-exclusive, non-transferable right to access and use the platform during an active
        subscription. No ownership rights to the software are transferred to users.
      </p>

      <h2>5. Subscription Plans</h2>
      <ul>
        <li>Access is provided through subscription plans.</li>
        <li>Plans may include free trials, monthly subscriptions, or annual subscriptions.</li>
        <li>Available features depend on the subscribed plan.</li>
        <li>OptoCare-EMR reserves the right to modify plans and pricing with reasonable notice.</li>
      </ul>

      <h2>6. Free Trial</h2>
      <ul>
        <li>Trial accounts may be limited in duration and features.</li>
        <li>At the end of the trial, continued access may require payment.</li>
        <li>OptoCare-EMR may suspend expired trial accounts.</li>
      </ul>

      <h2>7. Automatic Renewal</h2>
      <p>
        Subscriptions automatically renew at the end of each billing cycle unless cancelled before the
        next renewal date.
      </p>

      <h2>8. Payment and Refunds</h2>
      <ul>
        <li>Subscription fees are generally non-refundable.</li>
        <li>Failed payments may result in restricted access or account suspension.</li>
        <li>Applicable taxes and payment processing fees are the responsibility of the subscriber.</li>
        <li>Prices may change with prior notice.</li>
      </ul>

      <h2>9. Data Ownership</h2>
      <p>
        Clinics retain full ownership of their patient records and data. OptoCare-EMR does not claim
        ownership over any clinical data entered into the platform.
      </p>

      <h2>10. Multi-Tenant Environment</h2>
      <p>
        OptoCare-EMR operates in a secure multi-tenant environment. Each clinic's data is logically
        isolated. Users are strictly prohibited from attempting to access data belonging to another
        organization.
      </p>

      <h2>11. Data Export</h2>
      <p>
        Clinics may request export of their data in supported formats before account closure, subject to
        applicable laws and retention requirements.
      </p>

      <h2>12. Acceptable Use</h2>
      <p>Users must not:</p>
      <ul>
        <li>Share accounts with unauthorized persons.</li>
        <li>Upload malicious software.</li>
        <li>Attempt to hack, reverse engineer, or disrupt the platform.</li>
        <li>Access other clinics' information.</li>
        <li>Use the platform for any illegal purpose.</li>
      </ul>

      <h2>13. Service Availability</h2>
      <p>
        Although high uptime is targeted, uninterrupted service is not guaranteed. Scheduled maintenance
        and unforeseen outages may occur.
      </p>

      <h2>14. Account Suspension and Termination</h2>
      <p>OptoCare-EMR may suspend or terminate accounts for:</p>
      <ul>
        <li>Non-payment.</li>
        <li>Fraudulent activities.</li>
        <li>Security violations.</li>
        <li>Abuse of the platform.</li>
        <li>Violation of these terms.</li>
      </ul>

      <h2>15. Intellectual Property</h2>
      <p>
        All software, trademarks, branding, source code, user interfaces, designs, and documentation
        relating to OptoCare-EMR are the exclusive property of OptoCare Technologies. Users receive a
        license to use the platform and do not acquire ownership of the software.
      </p>

      <h2>16. Third-Party Services</h2>
      <p>OptoCare-EMR may integrate with third-party providers, including:</p>
      <ul>
        <li>Supabase</li>
        <li>Paystack</li>
        <li>Resend</li>
        <li>WhatsApp services</li>
        <li>SMS gateways</li>
        <li>Email services</li>
      </ul>
      <p>
        Availability of these integrations depends on the respective providers and is not guaranteed by
        OptoCare Technologies.
      </p>

      <h2>17. Backups and Disaster Recovery</h2>
      <p>
        Reasonable efforts are made to maintain backups and system reliability. However, OptoCare-EMR
        does not guarantee zero data loss or uninterrupted availability.
      </p>

      <h2>18. Service Level Disclaimer</h2>
      <p>
        OptoCare-EMR aims for high availability but does not guarantee uninterrupted service, error-free
        operation, or continuous uptime.
      </p>

      <h2>19. Limitation of Liability</h2>
      <p>
        OptoCare-EMR assists with record keeping and clinic management but does not replace clinical
        judgment. Healthcare decisions remain the responsibility of licensed professionals. To the
        maximum extent permitted by law, OptoCare Technologies shall not be liable for:
      </p>
      <ul>
        <li>Loss of profits.</li>
        <li>Loss of business opportunities.</li>
        <li>Indirect or consequential damages.</li>
        <li>Errors arising from inaccurate data entered by users.</li>
        <li>Clinical decisions made by healthcare providers.</li>
      </ul>

      <h2>20. AI Disclaimer</h2>
      <p>
        Any AI-powered suggestions, alerts, or decision-support tools provided by OptoCare-EMR are
        intended to assist healthcare professionals and do not replace professional clinical judgment.
        Users remain solely responsible for diagnosis, treatment, and patient care.
      </p>

      <h2>21. Governing Law</h2>
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be
        resolved within the appropriate Nigerian jurisdiction.
      </p>

      <h2>22. Entire Agreement</h2>
      <p>
        These Terms, together with the Privacy Policy, Cookie Policy, and Data Processing Agreement,
        constitute the entire agreement between OptoCare Technologies and its users regarding use of
        OptoCare-EMR.
      </p>
    </LegalLayout>
  );
}
