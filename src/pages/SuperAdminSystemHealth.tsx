import { useEffect, useState } from "react";
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Database, HardDrive, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { diag } from "@/lib/diag";
import { diagnoseConnection, type ConnectionDiagnosis } from "@/lib/diag/connectionDiagnosis";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";

export default function SuperAdminSystemHealth() {
  const { isAuthReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ db?: string; storage?: string; auth?: string; lastChecked?: string; dbLatency?: number; diagnosis?: ConnectionDiagnosis } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    setError(null);
    const end = diag.time("perf", "system-health-fetch");
    const started = performance.now();
    try {
      const diagnosisPromise = diagnoseConnection();
      const [{ error: dbError }, { data: sessionData, error: authError }] = await Promise.all([
        apiClient.from("clinics").select("id").limit(1),
        apiClient.auth.getSession(),
      ]);
      const dbLatency = Math.round(performance.now() - started);
      const diagnosis = await diagnosisPromise;
      setHealth({
        db: dbError ? "error" : "ok",
        storage: "not checked",
        auth: authError ? "error" : sessionData?.session ? "ok" : "no session",
        dbLatency,
        lastChecked: new Date().toISOString(),
        diagnosis,
      });
      if (dbError) setError(dbError.message);
    } catch (err: any) {
      console.error("[SystemHealth] fetch failed", err);
      diag.error("query", "system-health fetch failed", err);
      setError(err?.message || "Failed to load health");
      setHealth({ db: "error", storage: "not checked", auth: "error", lastChecked: new Date().toISOString() });
    } finally {
      end();
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthReady) return;
    void runHealthCheck();
  }, [isAuthReady]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <Activity className="text-primary" size={20} />
            <h1 className="text-xl font-semibold">System Health</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Live platform connectivity checks. This page reports what was actually tested.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void runHealthCheck()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "mr-2 animate-spin" : "mr-2"} /> Re-check
        </Button>
      </div>

      {error && (
        <div className="form-section text-sm text-destructive border-destructive/40">
          Failed to load system health: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Database", value: health?.db, icon: Database },
          { label: "Authentication", value: health?.auth, icon: ShieldCheck },
          { label: "Storage", value: health?.storage, icon: HardDrive },
        ].map((item) => (
          <div key={item.label} className="form-section">
            <div className="flex items-center gap-2 text-sm font-medium"><item.icon size={16} className="text-primary" /> {item.label}</div>
            {loading ? <Skeleton className="h-5 w-24 mt-3" /> : (
              <div className="mt-3">
                {item.value === "ok" ? <span className="inline-flex items-center gap-1 text-success font-medium"><CheckCircle2 size={14} /> Healthy</span> :
                 item.value === "error" ? <span className="inline-flex items-center gap-1 text-destructive font-medium"><XCircle size={14} /> Problem detected</span> :
                 <span className="inline-flex items-center gap-1 text-muted-foreground"><AlertTriangle size={14} /> {item.value || "Unknown"}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      {!loading && health?.diagnosis && (
        <div className="form-section">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-medium">Root-cause diagnosis</div>
              <div className="text-base font-semibold mt-1">{health.diagnosis.message}</div>
            </div>
            <span className="text-xs rounded-full border px-2 py-1 font-medium">{health.diagnosis.code}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
            <div><div className="text-muted-foreground">Internet</div><div className="font-medium">{health.diagnosis.internet}</div></div>
            <div><div className="text-muted-foreground">Authentication</div><div className="font-medium">{health.diagnosis.authentication}</div></div>
            <div><div className="text-muted-foreground">Database</div><div className="font-medium">{health.diagnosis.database}</div></div>
            <div><div className="text-muted-foreground">Edge services</div><div className="font-medium">{health.diagnosis.edgeFunctions}</div></div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Technical diagnosis: {health.diagnosis.technicalMessage}</div>
        </div>
      )}

      {!loading && health?.dbLatency !== undefined && (
        <div className="text-xs text-muted-foreground">Database probe: {health.dbLatency} ms • Last checked: {health.lastChecked ? new Date(health.lastChecked).toLocaleString() : "—"}</div>
      )}

      <div className="form-section">
        <div className="text-sm text-muted-foreground">Checks</div>
        <ul className="mt-2 list-disc list-inside text-sm">
          <li>Database connectivity and response latency</li>
          <li>Authentication/session availability</li>
          <li>Storage monitoring remains separate until a live storage probe is added</li>
          <li>Background job queue status (future)</li>
        </ul>
      </div>
    </div>
  );
}
