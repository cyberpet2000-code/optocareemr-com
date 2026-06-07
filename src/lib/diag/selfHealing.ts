import {
  getIssues,
  resolveIssue,
} from "./issueTracker";

export function runSelfHealing() {
  const issues = getIssues();

  let healedCount = 0;

  issues.forEach((issue) => {
    const name =
      issue.name.toLowerCase();

    const safeInfrastructureIssue =
      name.includes("cache") ||
      name.includes("loading") ||
      name.includes("sync") ||
      name.includes("network") ||
      name.includes("realtime");

    if (safeInfrastructureIssue) {
      resolveIssue(issue.name);
      healedCount++;
    }
  });

  return {
    healedCount,
  };
}
