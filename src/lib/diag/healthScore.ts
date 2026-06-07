import { getIssueHistory } from "./history";

export function getHealthScore() {
  const issues = getIssueHistory();

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
      score -= 10;
      return;
    }

    if (
      name.includes("performance")
    ) {
      score -= 5;
    }
  });

  return Math.max(
    score,
    0
  );
}
