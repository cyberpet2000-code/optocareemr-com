import { describe, expect, it } from "vitest";
import { hasClinicalAiRole, scrubUntrustedClinicalText, validateGatewayRequest } from "../../api/ai-gateway.js";

describe("OptoCare AI Gateway security", () => {
  it("rejects unsupported AI operations", () => {
    expect(validateGatewayRequest({ action: "execute_sql", clinicalData: "x" }).ok).toBe(false);
    expect(validateGatewayRequest({ action: "send_email", clinicalData: "x" }).ok).toBe(false);
  });

  it("requires clinical case data and enforces the size boundary", () => {
    expect(validateGatewayRequest({ action: "clinical_case_analysis", clinicalData: "" }).ok).toBe(false);
    expect(
      validateGatewayRequest({
        action: "clinical_case_analysis",
        clinicalData: "x".repeat(30001),
      }).status,
    ).toBe(413);
  });

  it("does not authorize receptionists for clinical AI", () => {
    expect(
      hasClinicalAiRole(
        { role: "receptionist", is_super_admin: false },
        [{ role: "receptionist", clinic_id: "clinic-a" }],
        [{ role: "receptionist", clinic_id: "clinic-a" }],
      ),
    ).toBe(false);
  });

  it("authorizes doctors and super admins", () => {
    expect(hasClinicalAiRole({ role: "doctor", is_super_admin: false }, [], [])).toBe(true);
    expect(hasClinicalAiRole({ role: "admin", is_super_admin: true }, [], [])).toBe(true);
  });

  it("scrubs common direct identifiers before provider submission", () => {
    const cleaned = scrubUntrustedClinicalText("Call 08012345678 or test@example.com");
    expect(cleaned).not.toContain("08012345678");
    expect(cleaned).not.toContain("test@example.com");
  });

  it("de-identifies labelled patient identifiers while preserving clinical content", () => {
    const cleaned = scrubUntrustedClinicalText(
      "Patient Name: John Doe\nDOB: 12/03/1989\nPhone: 08012345678\nMRN: ABC-12345\nDiagnosis: Myopia with astigmatism.",
    );

    expect(cleaned).not.toContain("John Doe");
    expect(cleaned).not.toContain("12/03/1989");
    expect(cleaned).not.toContain("08012345678");
    expect(cleaned).not.toContain("ABC-12345");
    expect(cleaned).toContain("Diagnosis: Myopia with astigmatism.");
  });

  it("removes common membership, government and machine identifiers", () => {
    const cleaned = scrubUntrustedClinicalText(
      "Enrollee Number: HMO-998877\nNIN: 12345678901\nVisit ID: 550e8400-e29b-41d4-a716-446655440000\nReferral: https://example.com/patient/abc.",
    );

    expect(cleaned).not.toContain("HMO-998877");
    expect(cleaned).not.toContain("12345678901");
    expect(cleaned).not.toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(cleaned).not.toContain("https://example.com/patient/abc");
    expect(cleaned).toContain("Referral:");
  });
});
