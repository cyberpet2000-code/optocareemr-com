import { getEntries } from "@/lib/diag/diagSinks";
import HealthCard from "./HealthCard";

export default function DiagFeed() {
  const entries = getEntries();

  const issues = entries.filter(
    (e) =>
      e.level === "error" ||
      e.level === "warn"
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
