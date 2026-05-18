import React, { useMemo, useState, useEffect } from "react";
import { diag } from "@/lib/diag";

export default function RuntimeLogsPanel() {
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<string[]>(() => {
    return diag.getLogs().map((l) => formatEntry(l));
  });

  useEffect(() => {
    const unsub = diag.subscribe((entries) => {
      setLogs(entries.map((l) => formatEntry(l)));
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return logs;
    return logs.filter((l) => l.toLowerCase().includes(filter.toLowerCase()));
  }, [logs, filter]);

  const copyLogs = async () => {
    try {
      const payload = filtered.join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const ta = document.createElement("textarea");
        ta.value = payload;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1900);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const clearLogsHandler = () => {
    diag.clearLogs();
  };

  const handleExport = (format: "log" | "json") => {
    diag.exportLogs(`opto-care-runtime-${new Date().toISOString()}`, format);
  };

  return (
    <div className="bg-white border border-slate-100 rounded-lg p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs (search)"
          className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          aria-label="Filter logs"
        />
        <div className="flex items-center gap-2">
          <button onClick={copyLogs} className="px-3 py-2 bg-slate-50 border rounded text-sm hover:bg-slate-100">
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => handleExport("log")} className="px-3 py-2 bg-white border rounded text-sm hover:bg-slate-50">
            Export .log
          </button>
          <button onClick={() => handleExport("json")} className="px-3 py-2 bg-white border rounded text-sm hover:bg-slate-50">
            Export JSON
          </button>
          <button onClick={clearLogsHandler} className="px-3 py-2 bg-rose-50 border border-rose-100 text-rose-700 rounded text-sm hover:bg-rose-100">
            Clear
          </button>
        </div>
      </div>

      <div className="h-64 overflow-auto bg-slate-50 border border-slate-100 rounded p-3 text-sm font-mono text-slate-700">
        {filtered.length === 0 ? (
          <div className="text-slate-400">No logs to show</div>
        ) : (
          filtered.slice().reverse().map((l, idx) => (
            <div key={idx} className="whitespace-pre-wrap break-words mb-1">
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatEntry(l: any) {
  const meta = l.metadata ? ` ${JSON.stringify(l.metadata)}` : "";
  return `[${l.timestamp}] ${l.level.toUpperCase()} ${l.category} ${l.message}${meta}`;
}
