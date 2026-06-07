import { getIssues } from "./issueTracker";

export function getHealthScore() {
  const issues = getIssues()
    .filter((i) => i.status === "open")
    .filter(
      (i) =>
        !i.name.toLowerCase().includes("stock") &&
        !i.name.toLowerCase().includes("inventory") &&
        !i.name.toLowerCase().includes("drugs")
    );

  let score = 100;

issues.forEach((issue) => {
  const name =
    issue.name.toLowerCase();

  if (
    name.includes("runtime")
  ) {
    score -= 40;
    return;
  }

  if (
    name.includes("database")
  ) {
    score -= 30;
    return;
  }

  if (
    name.includes("sync")
  ) {
    score -= 20;
    return;
  }

  if (
    name.includes("query")
  ) {
    score -= 15;
    return;
  }

  if (
    name.includes("revenue")
  ) {
    score -= 15;
    return;
  }

  if (
    name.includes("performance")
  ) {
    score -= 5;
  }
});

return Math.max(score, 0);
  );
}
