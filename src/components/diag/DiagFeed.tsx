import HealthCard from "./HealthCard";
import { getHealthScore } from "@/lib/diag/healthScore";
import {
  getIssues,
  analyzeRootCause,
  classifyIssue,
  analyzeTrend,
  getExecutiveSummary,
  analyzePriority,
  runSelfHealing,
} from "@/lib/diag";
import { getFixRecommendation } from "@/lib/diag/fixRecommendations";

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return (v ?? fallback) as T;
  } catch (e) {
    console.error("[DiagFeed] diagnostic failed:", e);
    return fallback;
  }
}

export default function DiagFeed() {
  const issues = safeCall(() => getIssues() ?? [], [] as ReturnType<typeof getIssues>);
  const score = safeCall(() => getHealthScore(), 100);
  const summary = safeCall(() => getExecutiveSummary(), {
    openCount: 0,
    resolvedCount: 0,
    highestPriority: "None",
    status: "healthy" as const,
  });

  const scoreOf = (name: string) =>
    safeCall(() => analyzePriority(name)?.score ?? 0, 0);

  const openIssues = (issues || [])
    .filter((i) => i?.status === "open")
    .sort((a, b) => scoreOf(b.name) - scoreOf(a.name));

  const resolvedIssues = (issues || [])
    .filter((i) => i?.status === "resolved")
    .sort((a, b) => scoreOf(b.name) - scoreOf(a.name));

  try {
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
                style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
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
          <div className="text-sm text-muted-foreground">AI Executive Summary</div>
          <div className="mt-2 text-sm">
            <div>Open Issues: <strong>{summary.openCount}</strong></div>
            <div>Resolved Issues: <strong>{summary.resolvedCount}</strong></div>
            <div className="mt-2">Highest Priority:</div>
            <div className="font-semibold text-red-500">{summary.highestPriority}</div>
          </div>
        </div>

        {issues.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground rounded-xl border">
            No active issues detected.
          </div>
        ) : (
          <>
            <div className="mb-3">
              <button
                onClick={() => {
                  const ok = window.confirm(
                    "Run AI Auto-Heal?\n\nOnly low-risk infrastructure issues will be fixed automatically."
                  );
                  if (!ok) return;
                  try {
                    const result = runSelfHealing();
                    alert(`AI resolved ${result?.healedCount ?? 0} issue(s).`);
                    window.location.reload();
                  } catch (e) {
                    console.error(e);
                    alert("Auto-heal failed. See console for details.");
                  }
                }}
                className="w-full rounded-lg bg-green-600 text-white py-2 text-sm font-medium"
              >
                🤖 Auto Heal Issues
              </button>
            </div>

            {openIssues.length > 0 && (
              <>
                <div className="text-sm font-semibold text-red-500">Active Issues</div>
                {openIssues.map((issue, idx) => {
                  const rootCause = safeCall(
                    () => analyzeRootCause(issue.name),
                    { cause: "Unknown", fix: "Manual investigation required.", confidence: 0 }
                  );
                  const analysis = safeCall(
                    () => classifyIssue(issue.name),
                    { category: "unknown", confidence: 0, impact: "unknown" } as any
                  );
                  const trend = safeCall(
                    () => analyzeTrend(issue.name, issue.occurrences),
                    { trend: "stable", prediction: "n/a" } as any
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
                <div className="text-sm font-semibold text-green-500 mt-4">Resolved Issues</div>
                {resolvedIssues.map((issue, idx) => (
                  <HealthCard
                    key={`resolved-${idx}`}
                    title={issue.name}
                    severity="info"
                    description={`Resolved Successfully\n\nOccurrences:\n${issue.occurrences}`}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    );
  } catch (e) {
    console.error("[DiagFeed] fatal render error:", e);
    return (
      <div className="p-4 text-sm text-muted-foreground rounded-xl border">
        Diagnostics temporarily unavailable
      </div>
    );
  }
}
