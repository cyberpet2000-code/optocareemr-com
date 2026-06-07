import { getIssues } from "./issueTracker";
import { analyzePriority } from "./priorityAnalyzer";

export function getExecutiveSummary() {
  const issues = getIssues();

  const openIssues = issues.filter(
    (i) => i.status === "open"
  );

  const highest =
    openIssues
      .map((i) => ({
        issue: i,
        priority: analyzePriority(i.name),
      }))
      .sort(
        (a, b) =>
          b.priority.score -
          a.priority.score
      )[0];

  return {
    openCount: openIssues.length,
    resolvedCount:
      issues.length - openIssues.length,
    highestPriority:
      highest?.issue?.name ?? "None",
  };
}
