import { getEntries } from "@/lib/diag/diagSinks";
import HealthCard from "./HealthCard";
import { healthHint } from "@/lib/diag/healthHints";

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
      .map((e) => [
        `${e.area}-${e.name}`,
        e,
      ])
  ).values()
);

  if (issues.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No active issues detected.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues
        .slice()
        .reverse()
        .map((issue, idx) => (
          <HealthCard
            key={idx}
            title={issue.name}
            severity={
              issue.level === "error"
                ? "critical"
                : "warn"
            }
            description={
              healthHint(issue.name) ||
              issue.hint ||
              JSON.stringify(
                issue.data,
                null,
                2
              )
            }
          />
        ))}
    </div>
  );
}
