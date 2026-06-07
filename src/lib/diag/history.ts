export interface IssueHistoryEntry {
  name: string;
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  status: "open" | "resolved";
  resolvedAt?: number;
}

export const issueHistorySeed: IssueHistoryEntry[] = [
  
];
