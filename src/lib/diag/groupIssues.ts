export interface GroupedIssue {
  name: string;
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
  entries: any[];
}

export function groupIssues(
  entries: any[]
): GroupedIssue[] {
  const groups = new Map();

  for (const entry of entries) {
    const key = entry.name;

    if (!groups.has(key)) {
      groups.set(key, {
        name: key,
        occurrences: 1,
        firstSeen: entry.t,
        lastSeen: entry.t,
        entries: [entry],
      });
    } else {
      const g = groups.get(key);

      g.occurrences++;
      g.lastSeen = entry.t;
      g.entries.push(entry);
    }
  }

  return Array.from(groups.values());
}
