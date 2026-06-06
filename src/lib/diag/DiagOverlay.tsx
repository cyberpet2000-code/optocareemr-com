// Dev-only diagnostic overlay. Mounted lazily by App when isDiagEnabled().
// Toggle visibility with Ctrl+Shift+D. Zero impact when not mounted.

import { useEffect, useMemo, useState } from "react";
import { clearEntries, getEntries, subscribe, type DiagEntry } from "./diagSinks";
import DiagFeed from "@/components/diag/DiagFeed";

type Tab = "all" | "errors" | "perf" | "health";

export default function DiagOverlay() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [entries, setEntries] = useState<DiagEntry[]>(() => getEntries());

  useEffect(() => subscribe(() => setEntries(getEntries())), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
  if (tab === "health") {
    return entries.filter(
      (e) =>
        e.level === "error" ||
        e.level === "warn"
    );
  }

  if (tab === "errors") {
    return entries.filter(
      (e) =>
        e.level === "error" ||
        e.level === "warn"
    );
  }

  if (tab === "perf") {
    return entries.filter(
      (e) =>
        e.durationMs !== undefined
    );
  }

  return entries;
}, [entries, tab]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, right: 8, zIndex: 99999,
          background: "#111", color: "#fff", border: "1px solid #333",
          borderRadius: 6, padding: "4px 8px", fontSize: 11, fontFamily: "monospace",
          opacity: 0.6, cursor: "pointer",
        }}
        title="Open diagnostics (Ctrl+Shift+D)"
      >
        diag · {entries.length}
      </button>
    );
  }

  const copy = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
    } catch { /* noop */ }
  };

  return (
    <div
      style={{
        position: "fixed", right: 8, bottom: 8, zIndex: 99999,
        width: "min(560px, 95vw)", maxHeight: "70vh",
        background: "#0b0b0b", color: "#e5e7eb", border: "1px solid #333",
        borderRadius: 8, display: "flex", flexDirection: "column",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderBottom: "1px solid #222" }}>
        <strong style={{ color: "#93c5fd" }}>OptoCare Diagnostics</strong>
        <span style={{ opacity: 0.6 }}>· {entries.length} events</span>
        <div style={{ flex: 1 }} />
        {(["all", "errors", "perf", "health"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "#1f2937" : "transparent",
              color: tab === t ? "#fff" : "#9ca3af",
              border: "1px solid #333", borderRadius: 4,
              padding: "2px 6px", fontSize: 11, cursor: "pointer",
            }}
          >{t}</button>
        ))}
        <button onClick={copy} style={btn}>copy</button>
        <button onClick={clearEntries} style={btn}>clear</button>
        <button onClick={() => setOpen(false)} style={btn}>×</button>
      </div>
      <div style={{ overflow: "auto", padding: 6 }}>
        {tab === "health" ? (
          <DiagFeed />
        ) : (
          <>
            {filtered.length === 0 && <div style={{ opacity: 0.6, padding: 8 }}>No entries.</div>}
            {filtered.slice().reverse().map((e, i) => (
              <div key={i} style={{
                padding: "4px 6px", borderBottom: "1px solid #1a1a1a",
                color: e.level === "error" ? "#fecaca" : e.level === "warn" ? "#fde68a" : "#d1d5db",
              }}>
                <div>
                  <span style={{ opacity: 0.5 }}>{new Date(e.t).toLocaleTimeString()}</span>{" "}
                  <span style={{ color: "#60a5fa" }}>[{e.area}]</span>{" "}
                  <span>{e.name}</span>
                  {e.durationMs !== undefined && <span style={{ opacity: 0.7 }}> · {e.durationMs}ms</span>}
                </div>
                {e.data && <div style={{ opacity: 0.75, whiteSpace: "pre-wrap", marginLeft: 8 }}>{safeJson(e.data)}</div>}
                {e.hint && <div style={{ color: "#fbbf24", marginLeft: 8 }}>↳ {e.hint}</div>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "transparent", color: "#9ca3af",
  border: "1px solid #333", borderRadius: 4,
  padding: "2px 6px", fontSize: 11, cursor: "pointer",
};

function safeJson(v: unknown) {
  try { return JSON.stringify(v); } catch { return String(v); }
}
