import LegalLayout from "./LegalLayout";

export default function DPA() {
  return (
    <LegalLayout
      title="Data Processing Agreement"
      description="The roles, responsibilities, and safeguards governing data processed through OptoCare-EMR."
    >
      <h2>Roles</h2>
      <ul>
        <li><strong>Clinics</strong> act as Data Controllers for the patient information they store.</li>
        <li><strong>OptoCare-EMR</strong> acts as a Data Processor on behalf of the clinic.</li>
      </ul>

      <h2>Scope of Processing</h2>
      <p>
        Data is processed only according to clinic instructions and for the purpose of providing the
        OptoCare-EMR service.
      </p>

      <h2>Security Measures</h2>
      <p>
        Appropriate technical and organizational security measures are maintained, including encryption,
        access controls, role-based permissions, and audit logging.
      </p>

      <h2>Sub-Processors</h2>
      <p>
        OptoCare-EMR may engage sub-processors (such as hosting and email delivery providers) to support
        the service. Sub-processors are required to uphold equivalent data protection standards.
      </p>

      <h2>Data Breach Notification</h2>
      <p>
        Data breaches affecting clinic or patient information will be communicated to affected clinics
        promptly, along with relevant remediation information.
      </p>

      <h2>Return and Deletion of Data</h2>
      <p>
        Upon termination of the service, clinics may request export of their data in supported formats.
        Residual data will be deleted in line with retention and backup policies.
      </p>
    </LegalLayout>
  );
}
