import HealthCard from "./HealthCard";
import { getHealthScore } from "@/lib/diag/healthScore";
import { getIssues } from "@/lib/diag";
import { getFixRecommendation } from "@/lib/diag/fixRecommendations";
import { analyzeRootCause }
from "@/lib/diag";

export default function DiagFeed() {
  const issues = getIssues();

  const openIssues = issues.filter(
    (i) => i.status === "open"
  );

  const resolvedIssues = issues.filter(
    (i) => i.status === "resolved"
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
      {openIssues.length > 0 && (
        <>
          <div className="text-sm font-semibold text-red-500">
            Active Issues
          </div>

          {openIssues.map((issue, idx) => {
            const rootCause = analyzeRootCause(issue.name);

            return (
              <HealthCard
                key={`open-${idx}`}
                title={issue.name}
                severity="critical"
                description={`Occurrences: ${issue.occurrences}

Root Cause:
${rootCause.cause}

Recommended Fix:
${getFixRecommendation(issue.name) || rootCause.fix || "No recommendation available."}`}
              />
            );
          })}
        </>
      )}

      {resolvedIssues.length > 0 && (
        <>
          <div className="text-sm font-semibold text-green-500 mt-4">
            Resolved Issues
          </div>

          {resolvedIssues.map((issue, idx) => (
            <HealthCard
              key={`resolved-${idx}`}
              title={issue.name}
              severity="info"
              description={`Resolved Successfully

Occurrences:
${issue.occurrences}`}
            />
          ))}
        </>
      )}
    </div>
  );
}
