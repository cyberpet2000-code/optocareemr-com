export function analyzeTrend(
  issueName: string,
  occurrences: number
) {
  if (occurrences >= 10) {
    return {
      trend: "Increasing",
      risk: "High",
      prediction:
        "Issue likely to reoccur soon",
    };
  }

  if (occurrences >= 5) {
    return {
      trend: "Stable",
      risk: "Medium",
      prediction:
        "Monitor closely",
    };
  }

  return {
    trend: "Isolated",
    risk: "Low",
    prediction:
      "No immediate concern",
  };
}
