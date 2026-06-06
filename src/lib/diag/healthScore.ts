import { getEntries } from "./diagSinks";

export function getHealthScore() {
  const entries = getEntries();

  let score = 100;

  entries.forEach((entry) => {
    if (entry.level === "error") {
      score -= 10;
    }

    if (entry.level === "warn") {
      score -= 5;
    }
  });

  return Math.max(score, 0);
}
