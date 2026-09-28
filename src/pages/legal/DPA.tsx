import LegalLayout from "./LegalLayout";

export default function DPA() {
  return (
    <LegalLayout title="Data Processing Agreement" description="Processing terms for Customer Data handled through OptoCare-EMR.">
      <p><strong>Version 1.0 · Effective date: [TO BE INSERTED] · Corporate registration details pending CAC registration.</strong></p>

      <h2>1. Parties and Roles</h2>
      <p>For Customer Data processed on behalf of a clinic, the clinic is generally the Controller and OptoCare Technologies is the Processor, subject to applicable law. Each party remains responsible for obligations that apply directly to it.</p>

      <h2>2. Subject Matter and Duration</h2>
      <p>The subject matter is the processing required to provide OptoCare-EMR, including hosting, authentication, storage, support, security, backups, reporting and enabled integrations. Processing continues for the term of the service and limited post-termination periods required for export, security, legal obligations and backup deletion.</p>

      <h2>3. Categories of Data and Data Subjects</h2>
      <p>Customer Data may include identity, contact, health, examination, prescription, image, billing, HMO, appointment, communication and technical information. Data subjects may include patients, guardians, clinic staff, healthcare professionals and other persons whose information the Customer lawfully enters into the service.</p>

      <h2>4. Processing Instructions</h2>
      <p>OptoCare will process Customer Data only to provide the service, maintain security and reliability, comply with documented Customer instructions, and meet legal obligations applicable to OptoCare. OptoCare will not use Customer Data for unrelated purposes except where permitted by law and the applicable agreement.</p>

      <h2>5. Confidentiality</h2>
      <p>Personnel authorised to process Customer Data must be subject to appropriate confidentiality obligations.</p>

      <h2>6. Security Measures</h2>
      <p>OptoCare maintains technical and organisational measures appropriate to risk, including tenant isolation controls, least-privilege access, authentication safeguards, encryption in transit and at rest where supported, logging, monitoring, backups and incident response.</p>

      <h2>7. Subprocessors</h2>
      <p>OptoCare may use subprocessors for infrastructure and service functions. OptoCare will maintain a subprocessor list and impose data-protection obligations appropriate to the services performed. Where required, Customers will receive notice of material subprocessor changes and a reasonable opportunity to raise a substantiated objection.</p>

      <h2>8. Assistance With Data-Subject Requests</h2>
      <p>Taking into account the nature of processing and available functionality, OptoCare will provide reasonable assistance to the Customer in responding to lawful data-subject requests and relevant regulatory obligations.</p>

      <h2>9. Security Incidents</h2>
      <p>OptoCare will maintain an incident-response process and notify the Customer without undue delay after confirming a security incident affecting Customer Data where notification is required. Notices will contain reasonably available information about the nature of the incident, affected systems or data, likely consequences and mitigation measures as they become known.</p>

      <h2>10. International Processing</h2>
      <p>Where Customer Data is processed outside Nigeria, the parties will apply safeguards and transfer mechanisms required by applicable law.</p>

      <h2>11. Audits and Information</h2>
      <p>OptoCare will make available appropriate information about its security and processing practices and will reasonably cooperate with lawful audits or regulatory requests, subject to confidentiality, security and proportionality requirements.</p>

      <h2>12. Return and Deletion</h2>
      <p>At the Customer's request after termination, OptoCare will make Customer Data available for export where technically supported. Following the applicable exit period, active copies will be deleted or anonymised, subject to legal retention requirements and normal backup-deletion cycles.</p>

      <h2>13. Customer Obligations</h2>
      <p>The Customer is responsible for its instructions, lawful basis, patient notices, access management, accuracy of records, professional obligations and the lawfulness of information supplied to OptoCare.</p>

      <h2>14. Order of Precedence</h2>
      <p>If this DPA conflicts with the Terms regarding personal-data processing, the DPA controls to the extent of the conflict. Mandatory law controls over conflicting contractual language.</p>
    </LegalLayout>
  );
}
