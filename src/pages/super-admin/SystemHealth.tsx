import React, { useEffect, useState } from "react";
import HealthCard from "../../components/health/HealthCard";
import StatusBadge from "../../components/health/StatusBadge";
import DiagnosticsTable, { Diagnostic } from "../../components/diagnostics/DiagnosticsTable";
import RuntimeLogsPanel from "../../components/logs/RuntimeLogsPanel";
import ErrorBoundary from "../../components/ErrorBoundary";

/**
 * Mock data: replace with real API calls when backend endpoints are available.
 */
const mockDiagnostics: Diagnostic[] = [
  {
    id: "d1",
    service: "PatientService",
    severity: "warning",
    message: "Delayed response times observed (p95 ~ 750ms)",
    timestamp: new Date().toISOString(),
    details:
      "9% of requests in the last 10m exceeded 500ms. Investigate DB indexes on appointments table.",
  },
  {
    id: "d2",
    service: "AuthService",
    severity: "critical",
    message: "JWT signing key rotation failed",
    timestamp: new Date().toISOString(),
    details:
      "Rotation job encountered permission errors writing to secret store. Rotation paused.",
  },
  {
    id: "d3",
    service: "ClinicHydration",
    severity: "ok",
    message: "Clinic configs hydrated successfully",
    timestamp: new Date().toISOString(),
    details: "All clinics synced within the last 2 minutes.",
  },
];

type DBCheck = {
  name: string;
  status: "ok" | "degraded" | "down";
  details?: string;
};

const mockDBChecks: DBCheck[] = [
  { name: "Primary DB connectivity", status: "ok" },
  { name: "Replica lag", status: "degraded", details: "Replica lag 12s" },
  { name: "Migration status", status: "ok" },
  { name: "Long-running queries", status: "degraded", details: "3 queries > 60s" },
];

type AuthHealth = {
  sessionsActive: number;
  sessionsExpired: number;
  lastSSOCheck: string;
  ok: boolean;
};

const mockAuthHealth: AuthHealth = {
  sessionsActive: 1283,
  sessionsExpired: 12,
  lastSSOCheck: new Date().toISOString(),
  ok: true,
};

export default function SystemHealth(): JSX.Element {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null);
  const [dbChecks, setDbChecks] = useState<DBCheck[] | null>(null);
  const [authHealth, setAuthHealth] = useState<AuthHealth | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulate fetch / initialization
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      setDiagnostics(mockDiagnostics);
      setDbChecks(mockDBChecks);
      setAuthHealth(mockAuthHealth);
      setLoading(false);
    }, 650);
    return () => clearTimeout(t);
  }, []);

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">System Health</h1>
            <p className="text-sm text-slate-500 mt-1">
              Super Admin dashboard — diagnostics, runtime logs, authentication & database checks
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <div className="text-sm text-slate-600">Overall status</div>
              <StatusBadge status="ok" label="Operational" />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HealthCard
            title="Auth & Session Health"
            subtitle="Authentication and session metrics"
            loading={loading}
            status={authHealth?.ok ? "ok" : "degraded"}
          >
            {authHealth && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">Active sessions</div>
                  <div className="font-medium text-slate-900">{authHealth.sessionsActive}</div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">Expired sessions (24h)</div>
                  <div className={`font-medium ${authHealth.sessionsExpired > 50 ? "text-rose-600" : "text-slate-900"}`}>
                    {authHealth.sessionsExpired}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">SSO last check</div>
                  <div className="text-sm text-slate-500">{new Date(authHealth.lastSSOCheck).toLocaleString()}</div>
                </div>

                <div className="pt-3">
                  <StatusBadge status={authHealth.ok ? "ok" : "degraded"} label={authHealth.ok ? "Healthy" : "Issues"} />
                </div>
              </div>
            )}
          </HealthCard>

          <HealthCard title="Clinic Hydration" subtitle="Clinic config sync status" loading={loading}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">Clinics hydrated</div>
                <div className="font-medium text-slate-900">74 / 74</div>
              </div>
              <div className="text-sm text-slate-600">Last sync</div>
              <div className="text-sm text-slate-500">2 minutes ago</div>
            </div>
          </HealthCard>

          <HealthCard title="Integrity Warnings" subtitle="Data & service integrity" loading={loading} status="warning">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <StatusBadge status="warning" />
                <div>
                  <div className="text-sm text-slate-800 font-medium">Missing indexes on appointments</div>
                  <div className="text-xs text-slate-500">May cause slow queries on appointment load</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <StatusBadge status="critical" />
                <div>
                  <div className="text-sm text-slate-800 font-medium">Secret store permission errors</div>
                  <div className="text-xs text-slate-500">Rotation job failed — investigate immediately</div>
                </div>
              </div>
              <div className="text-xs text-slate-400 pt-2">Open diagnostics for details.</div>
            </div>
          </HealthCard>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-slate-900">Diagnostics</h2>
              <div className="text-sm text-slate-500">Real-time alerts & warnings</div>
            </div>
            <DiagnosticsTable diagnostics={diagnostics} loading={loading} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-slate-900">Runtime Logs</h2>
              <div className="text-sm text-slate-500">Copy, clear or export runtime logs</div>
            </div>

            <RuntimeLogsPanel
              initialLogs={[
                "[2026-05-18T10:01:23Z] INFO Starting worker pid=1234",
                "[2026-05-18T10:01:28Z] WARN Replica lag=12s",
                "[2026-05-18T10:02:00Z] ERROR Auth rotation failed: permission denied",
                "[2026-05-18T10:03:10Z] INFO Clinic hydration completed: 74/74",
              ]}
            />
          </div>
        </section>

        <section>
          <h3 className="text-md font-medium text-slate-900 mb-3">Database Health Checks</h3>
          <div className="bg-white border border-slate-100 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dbChecks ? (
                dbChecks.map((c) => (
                  <div key={c.name} className="flex items-start gap-3">
                    <StatusBadge status={c.status === "ok" ? "ok" : c.status === "degraded" ? "warning" : "critical"} />
                    <div>
                      <div className="font-medium text-slate-900">{c.name}</div>
                      <div className="text-sm text-slate-500">{c.details ?? (c.status === "ok" ? "All good" : "Investigate")}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full animate-pulse h-12 bg-slate-100 rounded" />
              )}
            </div>
          </div>
        </section>
      </div>
    </ErrorBoundary>
  );
}
