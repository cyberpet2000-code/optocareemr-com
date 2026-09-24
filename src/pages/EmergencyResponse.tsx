import { useEffect, useState } from "react";
import { AlertOctagon, Activity, CheckCircle2, Database, Globe, KeyRound, RefreshCw, ServerCrash, Wifi, Wrench, ArrowLeft, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { diagnoseConnection, checkDatabaseService, type ConnectionDiagnosis, type ServiceStatus } from "@/lib/diag/connectionDiagnosis";
import { getQueuedIncidentCount } from "@/lib/diag/incidentReporter";
import { runSelfHealing, reportHealingResult } from "@/lib/diag/selfHealing";

function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === "online") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (status === "offline") return <ServerCrash className="h-5 w-5 text-red-600" />;
  return <Activity className="h-5 w-5 text-amber-600" />;
}

function StatusCard({ label, status, icon }: { label: string; status: ServiceStatus; icon: React.ReactNode }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="flex items-center gap-2 mt-1 font-semibold capitalize">
            <StatusIcon status={status} /> {status}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EmergencyResponse() {
  const [diagnosis, setDiagnosis] = useState<ConnectionDiagnosis | null>(null);
  const [database, setDatabase] = useState<ServiceStatus>("unknown");
  const [checking, setChecking] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [queued, setQueued] = useState(getQueuedIncidentCount());

  const runDiagnosis = async () => {
    setChecking(true);
    try {
      const [result, db] = await Promise.all([diagnoseConnection(), checkDatabaseService()]);
      setDiagnosis(result);
      setDatabase(db);
      setQueued(getQueuedIncidentCount());
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void runDiagnosis();
    const timer = window.setInterval(() => void runDiagnosis(), 30000);
    const online = () => void runDiagnosis();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);

  const runRecovery = async () => {
    setRecovering(true);
    try {
      const result = await runSelfHealing();
      await reportHealingResult(result);
      await runDiagnosis();
    } finally {
      setRecovering(false);
    }
  };

  const service = diagnosis ? {
    network: diagnosis.network,
    internet: diagnosis.internet,
    authentication: diagnosis.authentication,
    database,
    edgeFunctions: diagnosis.edgeFunctions,
    application: diagnosis.application,
  } : null;

  const hasServiceProblem = !!service && Object.values(service).some((v) => v === "offline");
  const headline = !diagnosis
    ? "Checking OptoCare services…"
    : hasServiceProblem
      ? "OptoCare service attention required"
      : diagnosis.code === "SLOW_NETWORK"
        ? "Connection is slow"
        : "OptoCare services are reachable";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <AlertOctagon className="h-4 w-4" /> Super Admin Emergency Response
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{headline}</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Emergency diagnosis and recovery console for platform-level incidents. Use this page to distinguish a local network problem from an OptoCare service problem before escalating.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/super-admin"><ArrowLeft className="h-4 w-4 mr-2" /> Super Admin</Link></Button>
          <Button variant="outline" onClick={() => void runDiagnosis()} disabled={checking}><RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} /> Re-check</Button>
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-1">
            <Button variant="outline" onClick={() => void runRecovery()} disabled={recovering} className="border-warning/50">
              <Wrench className={`h-4 w-4 mr-2 ${recovering ? "animate-spin" : ""}`} /> {recovering ? "Recovering…" : "Safe Recovery"}
            </Button>
          </div>
        </div>
      </div>

      {diagnosis && (
        <Card className="rounded-2xl border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Current Diagnosis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={hasServiceProblem ? "destructive" : "default"}>{diagnosis.code}</Badge>
              {diagnosis.latencyMs !== undefined && <Badge variant="outline">{diagnosis.latencyMs}ms probe</Badge>}
              <Badge variant="outline">{queued} queued offline incidents</Badge>
            </div>
            <div className="text-base font-semibold">{diagnosis.message}</div>
            <div className="text-sm text-muted-foreground">{diagnosis.technicalMessage}</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatusCard label="Device Network" status={diagnosis?.network ?? "unknown"} icon={<Wifi className="h-5 w-5" />} />
        <StatusCard label="Internet Access" status={diagnosis?.internet ?? "unknown"} icon={<Globe className="h-5 w-5" />} />
        <StatusCard label="Authentication" status={diagnosis?.authentication ?? "unknown"} icon={<KeyRound className="h-5 w-5" />} />
        <StatusCard label="Database" status={database} icon={<Database className="h-5 w-5" />} />
        <StatusCard label="Edge Functions" status={diagnosis?.edgeFunctions ?? "unknown"} icon={<ServerCrash className="h-5 w-5" />} />
        <StatusCard label="Application" status={diagnosis?.application ?? "unknown"} icon={<Activity className="h-5 w-5" />} />
      </div>

      <Card className="rounded-2xl border-primary/20">
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Diagnostics first</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Use <strong className="text-foreground">Re-check</strong> first. Safe Recovery only resets local application state; it does not change clinic data, database records, permissions, or production source code.</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Emergency Response Workflow</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border p-4"><strong>1. Check diagnosis</strong><p className="text-muted-foreground mt-1">Determine whether the failure is local connectivity, authentication, database, background service, or application related.</p></div>
          <div className="rounded-xl border p-4"><strong>2. Re-check</strong><p className="text-muted-foreground mt-1">Run the probes again before treating a single failed request as an outage.</p></div>
          <div className="rounded-xl border p-4"><strong>3. Safe Recovery</strong><p className="text-muted-foreground mt-1">Clears safe local caches, refreshes service-worker state and flushes queued diagnostic evidence. It does not modify production source code.</p></div>
          <div className="rounded-xl border p-4"><strong>4. Investigate</strong><p className="text-muted-foreground mt-1">Open System Health for incident fingerprints, affected clinics, stack traces, root-cause assistance and maintenance briefs.</p></div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><Link to="/super-admin/system-health">Open System Health & Incident Center</Link></Button>
        <Button variant="outline" asChild><Link to="/super-admin">Return to Super Admin Dashboard</Link></Button>
      </div>
    </div>
  );
}
