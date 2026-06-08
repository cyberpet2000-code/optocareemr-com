import { getIssues } from "./issueTracker";
import { analyzePriority } from "./priorityAnalyzer";

export interface ExecutiveSummary {
  openCount: number;
  resolvedCount: number;
  highestPriority: string;
  status: "healthy" | "warning";
}

export function getExecutiveSummary(): ExecutiveSummary {
  let history: ReturnType<typeof getIssues> = [];
  try {
    history = getIssues() ?? [];
  } catch {
    history = [];
  }

  const open = history.filter((h) => h?.status === "open");
  const resolved = history.filter((h) => h?.status === "resolved");

  let highest = "None";
  let topScore = -1;
  for (const issue of open) {
    try {
      const p = analyzePriority(issue.name);
      if (p && p.score > topScore) {
        topScore = p.score;
        highest = issue.name;
      }
    } catch {
      // ignore
    }
  }

  return {
    openCount: open.length,
    resolvedCount: resolved.length,
    highestPriority: highest,
    status: open.length === 0 ? "healthy" : "warning",
  };
}
