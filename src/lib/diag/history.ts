export interface IssueHistoryEntry {
  name: string;
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  status: "open" | "resolved";
  resolvedAt?: number;
}

export const issueHistorySeed: IssueHistoryEntry[] = [
  {
    name: "inventory request failed",
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    occurrences: 15,
    status: "open",
  },
  {
    name: "inventory request failed",
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    occurrences: 15,
    status: "resolved",
    resolvedAt: Date.now(),
  },
];
