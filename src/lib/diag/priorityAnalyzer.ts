export function analyzePriority(
  issueName: string
) {
  const name = issueName.toLowerCase();

  if (
    name.includes("revenue") ||
    name.includes("billing mismatch")
  ) {
    return {
      priority: "Critical",
      score: 100,
      businessImpact: "Revenue Loss",
    };
  }

  if (
    name.includes("auth") ||
    name.includes("login")
  ) {
    return {
      priority: "High",
      score: 90,
      businessImpact: "User Access Failure",
    };
  }

  if (
    name.includes("query") ||
    name.includes("database")
  ) {
    return {
      priority: "Medium",
      score: 70,
      businessImpact: "Feature Degradation",
    };
  }

  if (
    name.includes("inventory") ||
    name.includes("drug")
  ) {
    return {
      priority: "Low",
      score: 40,
      businessImpact: "Stock Alert",
    };
  }

  return {
    priority: "Unknown",
    score: 10,
    businessImpact: "Unknown",
  };
}
