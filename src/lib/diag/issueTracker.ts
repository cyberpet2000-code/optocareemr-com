type IssueStatus =
  | "open"
  | "resolved";

interface Issue {
  name: string;
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  status: IssueStatus;
  resolvedAt?: number;
}

const issues = new Map<string, Issue>();

export function reportIssue(
  name: string
) {
  const existing =
    issues.get(name);

  if (!existing) {
    issues.set(name, {
      name,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      occurrences: 1,
      status: "open",
    });

    return;
  }

  existing.lastSeen =
    Date.now();

  existing.occurrences += 1;

  existing.status = "open";
}

export function resolveIssue(
  name: string
) {
  const issue =
    issues.get(name);

  if (!issue) return;

  issue.status =
    "resolved";

  issue.resolvedAt =
    Date.now();
}

export function getIssues() {
  return Array.from(
    issues.values()
  );
}
