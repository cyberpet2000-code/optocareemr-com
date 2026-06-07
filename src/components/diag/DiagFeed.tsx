import HealthCard from "./HealthCard";
import { getHealthScore } from "@/lib/diag/healthScore";
import { getIssues } from "@/lib/diag";
import { getFixRecommendation } from "@/lib/diag/fixRecommendations";
import { analyzeRootCause }
from "@/lib/diag";
import { classifyIssue } from "@/lib/diag";
import { analyzeTrend } from "@/lib/diag";
import { getExecutiveSummary } from "@/lib/diag";
import { analyzePriority } from "@/lib/diag";
import { runSelfHealing } from "@/lib/diag";

export default function DiagFeed() {
  const issues = getIssues();

  const openIssues = issues
  .filter((i) => i.status === "open")
  .sort((a, b) => {
    const aScore =
      analyzePriority(a.name).score;

    const bScore =
      analyzePriority(b.name).score;

    return bScore - aScore;
  });

  const resolvedIssues = issues
  .filter((i) => i.status === "resolved")
  .sort((a, b) => {
    const aScore =
      analyzePriority(a.name).score;

    const bScore =
      analyzePriority(b.name).score;

    return bScore - aScore;
  });

  const score = getHealthScore();
  const summary = getExecutiveSummary();
  
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
      <div className="rounded-xl border p-4 mb-3">
  <div className="text-sm text-muted-foreground">
    AI Executive Summary
  </div>

  <div className="mt-2 text-sm">
    <div>
      Open Issues:
      <strong> {summary.openCount}</strong>
    </div>

    <div>
      Resolved Issues:
      <strong> {summary.resolvedCount}</strong>
    </div>

    <div className="mt-2">
      Highest Priority:
    </div>

    <div className="font-semibold text-red-500">
      {summary.highestPriority}
    </div>
  </div>
</div>
      <div className="mb-3">
  <button
    onClick={() => {
      const ok = window.confirm(
    "Run AI Auto-Heal?\n\nOnly low-risk infrastructure issues will be fixed automatically."
  );

  if (!ok) return;
      
      const result = runSelfHealing();

alert(
  `AI resolved ${result.healedCount} issue(s).`
);
      window.location.reload();
    }}
    className="w-full rounded-lg bg-green-600 text-white py-2 text-sm font-medium"
  >
    🤖 Auto Heal Issues
  </button>
</div>
      
      {openIssues.length > 0 && (
        <>
          <div className="text-sm font-semibold text-red-500">
            Active Issues
          </div>

          {openIssues.map((issue, idx) => {
            const rootCause = analyzeRootCause(issue.name);
          const analysis = classifyIssue(issue.name);
          const trend = analyzeTrend(
  issue.name,
  issue.occurrences
);

            return (
              <HealthCard
                key={`open-${idx}`}
                title={issue.name}
                severity="critical"
                description={`Occurrences: ${issue.occurrences}

            Category:
${analysis.category}

Confidence:
${analysis.confidence}%

Impact:
${analysis.impact}

Trend:
${trend.trend}

Prediction:
${trend.prediction}

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
