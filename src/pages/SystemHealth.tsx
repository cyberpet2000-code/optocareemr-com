import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, AlertTriangle, CheckCircle2, Clock3, Database, ShieldAlert,
  Wifi, RefreshCw, Bug, ServerCrash, Copy, Download, Wrench, CloudOff
} from "lucide-react";
import { diag } from "@/lib/diag";
import { apiClient } from "@/lib/apiClient";
import { analyzeRootCause, classifyIssue, analyzePriority, analyzeTrend, forecastHealth } from "@/lib/diag";
import { getQueuedIncidentCount, reportIncident } from "@/lib/diag/incidentReporter";
import { runSelfHealing, reportHealingResult } from "@/lib/diag/selfHealing";
import { diagnoseConnection, checkDatabaseService, type ConnectionDiagnosis } from "@/lib/diag/connectionDiagnosis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Incident = {
  id: string;
  fingerprint: string;
  clinic_id: string | null;
  page_name: string | null;
  route: string | null;
  error_name: string | null;
  error_message: string | null;
  stack: string | null;
  source: string;
  severity: string;
  status: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  context: Record<string, unknown>;
  clinic_name?: string | null;
};

const CACHE_KEY = "optocare:system-health-incidents";

function readCachedIncidents(): Incident[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function cacheIncidents(items: Incident[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items.slice(0, 100))); } catch {}
}

export default function SystemHealth() {
  const [entries, setEntries] = useState(() => diag.snapshot());
  const [incidents, setIncidents] = useState<Incident[]>(readCachedIncidents);
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(Date.now());
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [queuedIncidents, setQueuedIncidents] = useState(getQueuedIncidentCount());
  const [healing, setHealing] = useState(false);
  const [connectionDiagnosis, setConnectionDiagnosis] = useState<ConnectionDiagnosis | null>(null);

  const loadIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const [{ data, error }, { data: clinicRows }] = await Promise.all([
        (apiClient as any)
          .from("system_incidents")
          .select("id,fingerprint,clinic_id,page_name,route,error_name,error_message,stack,source,severity,status,occurrence_count,first_seen,last_seen,context")
          .order("last_seen", { ascending: false })
          .limit(100),
        apiClient.from("clinics").select("id,name"),
      ]);
      if (error) throw error;
      const clinicMap = new Map((clinicRows ?? []).map((c: any) => [c.id, c.name]));
      const rows = ((data ?? []) as Incident[]).map((incident) => ({
        ...incident,
        clinic_name: clinicMap.get(incident.clinic_id ?? "") ?? incident.clinic_name ?? null,
      }));
      setIncidents(rows);
      cacheIncidents(rows);
    } catch {
      setIncidents(readCachedIncidents());
    } finally {
      setLoadingIncidents(false);
    }
  };

  useEffect(() => {
    void loadIncidents();
    void diagnoseConnection().then(setConnectionDiagnosis);
    const interval = setInterval(() => {
      setEntries(diag.snapshot());
      setNow(Date.now());
      setQueuedIncidents(getQueuedIncidentCount());
    }, 2000);
    const refresh = setInterval(() => void loadIncidents(), 15000);
    const handleOnline = () => { setOnline(true); void loadIncidents(); void diagnoseConnection().then(setConnectionDiagnosis); };
    const handleOffline = () => { setOnline(false); void diagnoseConnection().then(setConnectionDiagnosis); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      clearInterval(interval);
      clearInterval(refresh);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const stats = useMemo(() => {
    const perf = entries.filter((e) => e.durationMs !== undefined);
    return {
      total: entries.length,
      errors: entries.filter((e) => e.level === "error").length,
      warnings: entries.filter((e) => e.level === "warn").length,
      avgPerf: perf.length ? Math.round(perf.reduce((a, e) => a + (e.durationMs || 0), 0) / perf.length) : 0,
      slowQueries: perf.filter((e) => (e.durationMs || 0) > 1500).length,
    };
  }, [entries]);

  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const resolvedIncidents = incidents.filter((i) => i.status === "resolved");
  const criticalIncidents = openIncidents.filter((i) => i.severity === "critical");
  const healthStatus = criticalIncidents.length || stats.errors > 5 ? "critical" : openIncidents.length || stats.warnings > 5 ? "warning" : "healthy";
  const forecast = forecastHealth();
  const recentEntries = [...entries].reverse().slice(0, 30);

  const copyText = async (value: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };

  const copyIncident = async (incident: Incident) => {
    await copyText(JSON.stringify({
      incident,
      classification: classifyIssue(incident.error_name || incident.error_message || incident.source),
      priority: analyzePriority(incident.error_name || incident.error_message || incident.source),
      trend: analyzeTrend(incident.fingerprint, incident.occurrence_count),
      rootCause: analyzeRootCause(incident.error_name || incident.error_message || incident.source, incident),
    }, null, 2), "Investigation copied");
  };

  const maintenanceBrief = (incident: Incident) => {
    const label = incident.error_name || incident.error_message || incident.source;
    const root = analyzeRootCause(label, incident);
    const priority = analyzePriority(label);
    const classification = classifyIssue(label);
    return [
      "OPTCARE MAINTENANCE INCIDENT",
      `Clinic: ${incident.clinic_name || "Unknown clinic"}`,
      `Page: ${incident.page_name || "Application"}`,
      `Route: ${incident.route || "Unknown"}`,
      `Error: ${incident.error_name || "Unknown"} — ${incident.error_message || "Unknown"}`,
      `Occurrences: ${incident.occurrence_count}`,
      `First seen: ${new Date(incident.first_seen).toLocaleString()}`,
      `Last seen: ${new Date(incident.last_seen).toLocaleString()}`,
      `Classification: ${classification.category} (${classification.confidence}%)`,
      `Priority: ${priority.priority} — ${priority.businessImpact}`,
      `Likely cause: ${root.cause}`,
      `Recommended fix: ${root.fix}`,
      `Confidence: ${root.confidence}%`,
      `Fingerprint: ${incident.fingerprint}`,
      "",
      "STACK TRACE:",
      incident.stack || "Not available",
    ].join("\n");
  };

  const copyMaintenanceBrief = async (incident: Incident) => {
    await copyText(maintenanceBrief(incident));
  };

  const resolveIncident = async (incident: Incident) => {
    if (!window.confirm("Mark this incident as resolved? This will move it out of Active Incidents.")) return;
    const { error } = await (apiClient as any).rpc("resolve_system_incident", { p_incident_id: incident.id });
    if (error) return;
    setSelected((current) => current?.id === incident.id ? { ...current, status: "resolved" } : current);
    await loadIncidents();
  };

  const runSafeRecovery = async () => {
    setHealing(true);
    try {
      const result = await runSelfHealing();
      await reportHealingResult(result);
      await loadIncidents();
      setQueuedIncidents(getQueuedIncidentCount());
      window.setTimeout(() => window.location.reload(), 500);
    } finally {
      setHealing(false);
    }
  };

  const exportDiagnostics = () => {
    const payload = { generatedAt: new Date().toISOString(), online, incidents, localEvents: entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optocare-system-health-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8" /> System Health & Incident Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Central maintenance view for application failures, page crashes, database errors and offline recovery.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={healthStatus === "healthy" ? "default" : "destructive"}>{healthStatus.toUpperCase()}</Badge>
          <Badge variant="outline">{online ? "CENTRAL SYNC" : "OFFLINE / LOCAL EVIDENCE"}</Badge>
          <Button variant="outline" onClick={() => void loadIncidents()} disabled={loadingIncidents}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingIncidents ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" onClick={() => void runSafeRecovery()} disabled={healing}>
            <Wrench className={`h-4 w-4 mr-2 ${healing ? "animate-spin" : ""}`} /> {healing ? "Running Recovery…" : "Run Safe Recovery"}
          </Button>
          <Button variant="outline" onClick={exportDiagnostics}>
            <Download className="h-4 w-4 mr-2" /> Export Diagnostic Bundle
          </Button>
        </div>
      </div>

      {!online && (
        <Card className="border-amber-300">
          <CardContent className="p-4 flex items-center gap-3">
            <CloudOff className="h-5 w-5" />
            <div>
              <div className="font-medium">Maintenance mode: offline evidence available</div>
              <div className="text-sm text-muted-foreground">
                Local runtime events remain available. Incidents captured while offline will sync automatically when connectivity returns.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {connectionDiagnosis && (
        <Card className="rounded-2xl shadow-sm border-primary/20">
          <CardHeader><CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" /> Connection & Service Diagnosis</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm font-medium">{connectionDiagnosis.message}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <StatusRow label="Network" ok={connectionDiagnosis.network === "online"} value={connectionDiagnosis.network} />
              <StatusRow label="Internet" ok={connectionDiagnosis.internet === "online"} value={connectionDiagnosis.internet} />
              <StatusRow label="Authentication" ok={connectionDiagnosis.authentication === "online"} value={connectionDiagnosis.authentication} />
              <StatusRow label="Database" ok={connectionDiagnosis.database !== "offline"} value={connectionDiagnosis.database} />
            </div>
            <div className="text-xs text-muted-foreground">{connectionDiagnosis.technicalMessage}</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <HealthCard title="Open Incidents" value={openIncidents.length} icon={<Bug className="h-5 w-5" />} description="Central incidents requiring attention" />
        <HealthCard title="Critical" value={criticalIncidents.length} icon={<ServerCrash className="h-5 w-5" />} description="Potentially service-impacting failures" />
        <HealthCard title="Local Errors" value={stats.errors} icon={<ShieldAlert className="h-5 w-5" />} description="Current browser diagnostic errors" />
        <HealthCard title="Warnings" value={stats.warnings} icon={<AlertTriangle className="h-5 w-5" />} description="Current browser warnings" />
        <HealthCard title="Avg Response" value={`${stats.avgPerf}ms`} icon={<Clock3 className="h-5 w-5" />} description="Measured request timing" />
        <HealthCard title="Connection" value={online ? "Online" : "Offline"} icon={<Wifi className="h-5 w-5" />} description="Current maintenance connection" />
        <HealthCard title="Queued Offline" value={queuedIncidents} icon={<CloudOff className="h-5 w-5" />} description="Incidents waiting to sync" />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Active Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          {openIncidents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No open incidents reported by clinics.</div>
          ) : (
            <div className="space-y-3">
              {openIncidents.slice(0, 20).map((incident) => {
                const label = incident.error_name || incident.error_message || incident.source;
                const priority = analyzePriority(label);
                const trend = analyzeTrend(incident.fingerprint, incident.occurrence_count);
                return (
                  <button key={incident.id} onClick={() => setSelected(incident)} className="w-full text-left border rounded-xl p-4 hover:bg-muted/50 transition">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={incident.severity === "critical" ? "destructive" : "secondary"}>{incident.severity}</Badge>
                      <Badge variant="outline">{priority.priority}</Badge>
                      <Badge variant="outline">{incident.source}</Badge>
                      <span className="font-semibold">{incident.page_name || incident.route || "Application"}</span>
                      {incident.clinic_name && <Badge variant="outline">{incident.clinic_name}</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{incident.occurrence_count} occurrence{incident.occurrence_count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="mt-2 text-sm">{incident.error_message || "Runtime failure reported"}</div>
                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-3">
                      <span>First: {new Date(incident.first_seen).toLocaleString()}</span>
                      <span>Last: {new Date(incident.last_seen).toLocaleString()}</span>
                      <span>Trend: {trend.trend}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card className="rounded-2xl shadow-sm border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Incident Investigation</span>
              <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <Info label="Clinic" value={selected.clinic_name || "Unknown clinic"} copyable />
              <Info label="Page" value={selected.page_name || "Application"} copyable />
              <Info label="Route" value={selected.route || "Unknown"} copyable />
              <Info label="Source" value={selected.source} />
              <Info label="Occurrences" value={String(selected.occurrence_count)} />
              <Info label="First seen" value={new Date(selected.first_seen).toLocaleString()} />
              <Info label="Last seen" value={new Date(selected.last_seen).toLocaleString()} />
              <Info label="Fingerprint" value={selected.fingerprint} copyable />
            </div>
            <div>
              <div className="font-semibold mb-1">Error</div>
              <div className="flex gap-2 items-start">
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto whitespace-pre-wrap flex-1">{selected.error_message || selected.error_name || "Unknown error"}</pre>
                <CopyButton value={selected.error_message || selected.error_name || "Unknown error"} />
              </div>
            </div>
            <div className="grid lg:grid-cols-3 gap-3">
              <AnalysisCard title="Classification" value={JSON.stringify(classifyIssue(selected.error_name || selected.error_message || selected.source), null, 2)} />
              <AnalysisCard title="Priority / Impact" value={JSON.stringify(analyzePriority(selected.error_name || selected.error_message || selected.source), null, 2)} />
              <AnalysisCard title="Root Cause Assistance" value={JSON.stringify(analyzeRootCause(selected.error_name || selected.error_message || selected.source, selected), null, 2)} />
            </div>
            <div className="rounded-xl border p-4">
              <div className="font-semibold mb-2">Maintenance Brief</div>
              <p className="text-xs text-muted-foreground mb-3">A clean, copyable summary for troubleshooting with the OptoCare maintenance team or ChatGPT.</p>
              <Button onClick={() => void copyMaintenanceBrief(selected)}><Copy className="h-4 w-4 mr-2" /> Copy Maintenance Brief</Button>
            </div>
            {selected.stack && (
              <details>
                <summary className="cursor-pointer font-medium">Technical stack trace</summary>
                <div className="flex gap-2 items-start mt-2">
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto whitespace-pre-wrap max-h-80 flex-1">{selected.stack}</pre>
                  <CopyButton value={selected.stack} />
                </div>
              </details>
            )}
            <div className="flex flex-wrap gap-2">
              {selected.route && <Button variant="outline" onClick={() => { window.open(selected.route!, "_blank", "noopener,noreferrer"); }}>Open Affected Page</Button>}
              <Button onClick={() => void copyIncident(selected)}><Copy className="h-4 w-4 mr-2" /> Copy Investigation</Button>
              <CopyButton value={selected.error_message || selected.error_name || ""} label="Copy Error" />
              <Button variant="outline" onClick={() => void resolveIncident(selected)} className="border-green-300 text-green-700">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Resolved
              </Button>
              <Button variant="outline" onClick={() => {
                void reportIncident({
                  page_name: selected.page_name,
                  route: selected.route,
                  error_name: selected.error_name,
                  error_message: "Maintenance re-check requested",
                  source: "maintenance-recheck",
                  severity: "info",
                  context: { fingerprint: selected.fingerprint },
                });
              }}>Record Re-check</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Resolved Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          {resolvedIncidents.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No resolved incidents yet.</div>
          ) : (
            <div className="space-y-2">
              {resolvedIncidents.slice(0, 20).map((incident) => (
                <button key={incident.id} onClick={() => setSelected(incident)} className="w-full text-left border rounded-xl p-3 hover:bg-muted/50 transition">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-green-300 text-green-700">RESOLVED</Badge>
                    <span className="font-medium">{incident.page_name || incident.route || "Application"}</span>
                    {incident.clinic_name && <Badge variant="outline">{incident.clinic_name}</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{incident.occurrence_count} occurrence{incident.occurrence_count === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-1 text-sm">{incident.error_message || "Incident"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Last seen: {new Date(incident.last_seen).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 rounded-2xl shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Recent Local Diagnostic Events</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-auto pr-1">
              {recentEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">No local events recorded yet.</div>
              ) : recentEntries.map((entry, index) => (
                <div key={index} className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={entry.level === "error" ? "destructive" : entry.level === "warn" ? "secondary" : "default"}>{entry.level}</Badge>
                      <Badge variant="outline">{entry.area}</Badge>
                      <span className="font-medium">{entry.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(entry.t).toLocaleTimeString()}</div>
                  </div>
                  {entry.durationMs !== undefined && <div className="text-sm">Duration: <strong>{entry.durationMs}ms</strong></div>}
                  {entry.data && <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto whitespace-pre-wrap">{JSON.stringify(entry.data, null, 2)}</pre>}
                  {entry.hint && <div className="text-sm border-l-2 pl-3 text-amber-600">{entry.hint}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader><CardTitle>System Status</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <StatusRow label="Application" ok={healthStatus !== "critical"} />
              <StatusRow label="Central Incident Sync" ok={online} value={online ? "Connected" : "Queued locally"} />
              <StatusRow label="Diagnostics Engine" ok />
              <StatusRow label="Slow Queries" ok={stats.slowQueries === 0} value={stats.slowQueries} />
              <StatusRow label="Health Forecast" ok={forecast.trend !== "declining"} value={forecast.trend} />
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader><CardTitle>Maintenance Snapshot</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="Current Route" value={window.location.pathname} />
              <Info label="Last refresh" value={new Date(now).toLocaleTimeString()} />
              <Info label="Buffered Events" value={String(entries.length)} />
              <Info label="Cached Incidents" value={String(incidents.length)} />
              <Info label="Offline Queue" value={String(queuedIncidents)} />
              <Info label="Forecast" value={forecast.prediction} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HealthCard({ title, value, icon, description }: { title: string; value: string | number; icon: React.ReactNode; description: string }) {
  return <Card className="rounded-2xl shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">{title}</p><h2 className="text-2xl font-bold mt-1">{value}</h2></div><div className="opacity-70">{icon}</div></div><p className="text-xs text-muted-foreground mt-3">{description}</p></CardContent></Card>;
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value?: string | number }) {
  return <div className="flex items-center justify-between border rounded-lg px-3 py-2"><div className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}<span className="text-sm">{label}</span></div><span className="text-sm font-medium">{value ?? (ok ? "OK" : "Attention")}</span></div>;
}

function Info({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2"><span className="text-muted-foreground shrink-0">{label}</span><div className="flex items-center gap-2 min-w-0"><span className="text-right break-all min-w-0">{value}</span>{copyable && <CopyButton value={value} />}</div></div>;
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()} title={label} aria-label={label} className="shrink-0 px-2">{copied ? "✓" : <Copy className="h-3.5 w-3.5" />}</Button>;
}

function AnalysisCard({ title, value }: { title: string; value: string }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent><pre className="text-xs whitespace-pre-wrap overflow-auto">{value}</pre></CardContent></Card>;
}
