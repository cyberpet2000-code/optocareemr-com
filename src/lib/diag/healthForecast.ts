import { getIssues } from "./issueTracker";

export function forecastHealth() {
  const issues = getIssues();

  const openCount =
    issues.filter(
      (i) => i.status === "open"
    ).length;

  if (openCount === 0) {
    return {
      prediction:
        "System expected to remain stable",
      confidence: 95,
      trend: "improving",
    };
  }

  if (openCount <= 3) {
    return {
      prediction:
        "Minor degradation possible",
      confidence: 85,
      trend: "stable",
    };
  }

  return {
    prediction:
      "High probability of additional failures",
    confidence: 92,
    trend: "declining",
  };
}
