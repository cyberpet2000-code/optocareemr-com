// src/lib/diagStore.ts
// Zustand-powered diagnostics store that mirrors the in-memory diag sink.
// Integrates with src/lib/diag/diagSinks.ts via subscribe/getEntries so all diag.* calls
// automatically appear in the UI feed.

import create from "zustand";
import { subscribe, getEntries, type DiagEntry as SinkDiagEntry } from "@/lib/diag/diagSinks";

export type DiagLevel = "info" | "warn" | "error";

export type DiagEvent = {
  id: string;
  level: DiagLevel;
  category: string;
  message: string;
  timestamp: number; // ms since epoch
  metadata?: Record<string, unknown> | null;
};

type DiagStoreState = {
  events: DiagEvent[]; // newest first
  // push a single event (UI-level, won't create recursive diag entries)
  push: (e: Omit<Partial<DiagEvent>, "id" | "timestamp"> & { message: string }) => void;
  clear: () => void;
  // internal: replace events (used by sink->store mirroring)
  _replace: (events: DiagEvent[]) => void;
};

const MAX = 200;

function mkId(ts: number) {
  return `${ts}-${Math.random().toString(36).slice(2, 9)}`;
}

function mapSinkToEvent(s: SinkDiagEntry): DiagEvent {
  const baseMessage = s.name || "";
  // prefer structured message if present
  let msg = baseMessage;
  if (s.data && (s.data as any).message) {
    msg = `${baseMessage} — ${(s.data as any).message}`;
  }
  const metadata: Record<string, unknown> = {};
  if (s.data) metadata.data = s.data;
  if (s.hint) metadata.hint = s.hint;
  if (s.durationMs !== undefined) metadata.durationMs = s.durationMs;
  return {
    id: mkId(s.t),
    level: s.level,
    category: s.area,
    message: msg,
    timestamp: s.t,
    metadata: Object.keys(metadata).length ? metadata : null,
  };
}

export const useDiagStore = create<DiagStoreState>((set, get) => {
  // initial mirror from sink
  const fromSink = getEntries().slice().map(mapSinkToEvent).reverse(); // sink is oldest-first; reverse to newest-first
  const initial = fromSink.slice(-MAX).slice().reverse(); // newest first
  // We invert twice above to ensure newest-first ordering consistently

  // Subscribe to sink updates. We debounce updates with requestAnimationFrame to avoid flood re-renders.
  let raf = 0 as number | undefined;
  subscribe(() => {
    // schedule single RAF update
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      try {
        const sink = getEntries();
        // sink is oldest-first
        const mapped = sink.slice(-MAX).map(mapSinkToEvent).reverse(); // newest-first
        // quick equality check: length + newest timestamp prevents needless set
        const cur = get().events;
        if (cur.length === mapped.length && cur[0]?.timestamp === mapped[0]?.timestamp) {
          return;
        }
        set({ events: mapped });
      } finally {
        raf = undefined;
      }
    });
  });

  return {
    events: initial,
    push: (payload) => {
      const timestamp = Date.now();
      const e: DiagEvent = {
        id: payload.id ?? mkId(timestamp),
        level: (payload.level as DiagLevel) ?? "info",
        category: payload.category ?? "app",
        message: payload.message,
        timestamp,
        metadata: payload.metadata ?? null,
      };
      set((s) => {
        const next = [e, ...s.events];
        if (next.length > MAX) next.length = MAX;
        return { events: next };
      });
    },
    clear: () => set({ events: [] }),
    _replace: (events) => set({ events }),
  };
});
