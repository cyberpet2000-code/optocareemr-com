import { getEntries } from "@/lib/diag/diagSinks";
import HealthCard from "./HealthCard";
import { getHealthScore } from "@/lib/diag/healthScore";
import { healthHint } from "@/lib/diag/healthHints";
import { getFixRecommendation } from "@/lib/diag/fixRecommendations";

export default function DiagFeed() {
  const entries = getEntries();

   const issues = Array.from(
  new Map(
    entries
      .filter(
        (e) =>
          e.level === "error" ||
          e.level === "warn"
      )
      .map((e) => {
        const key = `${e.area}-${e.name}`;

        return [
          key,
          {
            ...e,
            occurrences:
              entries.filter(
                (x) =>
                  x.area === e.area &&
                  x.name === e.name
              ).length,
          },
        ];
      })
  ).values()
);
  
const score = getHealthScore();
  
  if (issues.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No active issues detected.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      
      <div className="rounded-xl border p-4 mb-3">
  <div className="text-sm text-muted-foreground">
    System Health Score
    <div className="mt-2 h-2 w-full rounded bg-muted">
  <div
    className={`h-2 rounded ${
      score >= 90
        ? "bg-green-500"
        : score >= 70
        ? "bg-yellow-500"
        : "bg-red-500"
    }`}
    style={{ width: `${score}%` }}
  />
</div>
  </div>

  <div
  className={`text-2xl font-bold ${
    score >= 90
      ? "text-green-500"
      : score >= 70
      ? "text-yellow-500"
      : "text-red-500"
  }`}
>
  {score}%
</div>
        
</div>
      {issues
        .slice()
        .reverse()
        .map((issue, idx) => (
          <HealthCard
            key={idx}
            title={`${issue.name} (${issue.occurrences}x)`}
            severity={
              issue.level === "error"
                ? "critical"
                : "warn"
            }
            description={`${
              healthHint(issue.name) ||
              issue.hint ||
              "Issue detected."
            }
            
            Occurrences:
${issue.occurrences}

Recommended Fix:
${getFixRecommendation(issue.name) || "No recommendation available."}`}
          />
        ))}
    </div>
  );
}
