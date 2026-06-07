export function analyzeRisk(
  issueName: string
) {
  const name = issueName.toLowerCase();

  if (
    name.includes("revenue") ||
    name.includes("billing")
  ) {
    return {
      riskScore: 97,
      businessImpact: "Revenue Loss",
      estimatedCost: "₦1,416,350",
    };
  }

  if (
    name.includes("auth") ||
    name.includes("login")
  ) {
    return {
      riskScore: 90,
      businessImpact: "User Access Failure",
      estimatedCost: "High",
    };
  }

  if (
    name.includes("query") ||
    name.includes("database")
  ) {
    return {
      riskScore: 75,
      businessImpact: "Feature Degradation",
      estimatedCost: "Medium",
    };
  }

  if (
    name.includes("inventory") ||
    name.includes("drug")
  ) {
    return {
      riskScore: 25,
      businessImpact: "Stock Alert",
      estimatedCost: "Low",
    };
  }

  return {
    riskScore: 10,
    businessImpact: "Unknown",
    estimatedCost: "Unknown",
  };
}
