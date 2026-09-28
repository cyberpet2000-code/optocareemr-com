import LegalLayout from "./LegalLayout";

export default function AcceptableUse() {
  return <LegalLayout title="Acceptable Use Policy" description="Permitted and prohibited uses of OptoCare-EMR.">
    <p><strong>Version 1.0 · Effective date: [TO BE INSERTED].</strong></p>
    <h2>Permitted Use</h2><p>Use OptoCare only for lawful clinic, healthcare, administrative and related purposes authorised by the Customer.</p>
    <h2>Prohibited Conduct</h2><ul><li>Attempting to access another clinic's data or credentials.</li><li>Introducing malware or deliberately disrupting service availability.</li><li>Bypassing authentication, tenant controls, rate limits or security measures.</li><li>Reverse engineering or extracting protected source code except where mandatory law permits it.</li><li>Using the service for unlawful surveillance, fraud, harassment or other unlawful activity.</li><li>Submitting information that the Customer is not legally entitled to process.</li><li>Using AI output as an unattended or automated clinical decision without required professional review.</li></ul>
    <h2>Enforcement</h2><p>OptoCare may investigate suspected abuse and restrict access where reasonably necessary to protect people, data or systems, subject to applicable law and the Terms.</p>
  </LegalLayout>;
}
