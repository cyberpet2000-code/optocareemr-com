export function classifyIssue(issue: string) {
  const name = issue.toLowerCase();

  if (name.includes("referenceerror") || name.includes("not defined") || name.includes("typeerror")) {
    return { category: "Application Runtime", confidence: 97, impact: "High" };
  }

  if (name.includes("inventory") || name.includes("drug")) {
    return { category: "Inventory", confidence: 98, impact: "Low" };
  }

  if (name.includes("billing") || name.includes("revenue")) {
    return { category: "Finance", confidence: 95, impact: "High" };
  }

  if (name.includes("auth") || name.includes("login")) {
    return { category: "Authentication", confidence: 97, impact: "Critical" };
  }

  if (name.includes("query") || name.includes("database")) {
    return { category: "Database", confidence: 92, impact: "Medium" };
  }

  return { category: "Unknown", confidence: 50, impact: "Unknown" };
}
