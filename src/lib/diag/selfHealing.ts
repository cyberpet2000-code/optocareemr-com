import {
  getIssues,
  resolveIssue,
} from "./issueTracker";

export function runSelfHealing() {
  const issues = getIssues();

  issues.forEach((issue) => {
    const name =
      issue.name.toLowerCase();

    if (
      name.includes("inventory") ||
      name.includes("drug")
    ) {
      resolveIssue(issue.name);
    }

    if (
      name.includes("cache")
    ) {
      resolveIssue(issue.name);
    }

    if (
      name.includes("loading")
    ) {
      resolveIssue(issue.name);
    }
  });

  return {
    healedIssues:
      issues.filter(
        (i) => i.status === "open"
      ).length,
  };
}
