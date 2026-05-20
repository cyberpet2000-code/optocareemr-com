import { useEffect, useMemo, useState } from "react"; import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, ShieldAlert, Wifi } from "lucide-react"; import { diag } from "@/lib/diag"; import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; import { Button } from "@/components/ui/button"; import { Badge } from "@/components/ui/badge";

export default function SystemHealth() { const [entries, setEntries] = useState(() => diag.snapshot()); const [online, setOnline] = useState(navigator.onLine); const [now, setNow] = useState(Date.now());

useEffect(() => { const interval = setInterval(() => { setEntries(diag.snapshot()); setNow(Date.now()); }, 2000);

const handleOnline = () => setOnline(true);
const handleOffline = () => setOnline(false);

window.addEventListener("online", handleOnline);
window.addEventListener("offline", handleOffline);

return () => {
  clearInterval(interval);
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
};

}, []);

const stats = useMemo(() => { const total = entries.length; const errors = entries.filter((e) => e.level === "error").length; const warnings = entries.filter((e) => e.level === "warn").length; const perf = entries.filter((e) => e.durationMs !== undefined);

const avgPerf = perf.length
  ? Math.round(
      perf.reduce((acc, cur) => acc + (cur.durationMs || 0), 0) / perf.length
    )
  : 0;

const slowQueries = perf.filter((e) => (e.durationMs || 0) > 1500).length;

return {
  total,
  errors,
  warnings,
  avgPerf,
  slowQueries,
};

}, [entries]);

const recentEntries = [...entries].reverse().slice(0, 30);

const healthStatus = stats.errors > 5 ? "critical" : stats.warnings > 5 ? "warning" : "healthy";

return ( <div className="p-6 space-y-6"> <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"> <div> <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"> <Activity className="h-8 w-8" /> System Health </h1> <p className="text-muted-foreground mt-1"> Real-time OptoCare EMR diagnostics and operational monitoring. </p> </div>

<div className="flex items-center gap-2">
      <Badge variant={healthStatus === "healthy" ? "default" : "destructive"}>
        {healthStatus.toUpperCase()}
      </Badge>

      <Button
        variant="outline"
        onClick={() => {
          const data = JSON.stringify(entries, null, 2);
          navigator.clipboard.writeText(data);
        }}
      >
        Copy Logs
      </Button>
    </div>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
    <HealthCard
      title="Total Events"
      value={stats.total}
      icon={<Activity className="h-5 w-5" />}
      description="Captured diagnostic events"
    />

    <HealthCard
      title="Errors"
      value={stats.errors}
      icon={<ShieldAlert className="h-5 w-5" />}
      description="Critical system issues"
    />

    <HealthCard
      title="Warnings"
      value={stats.warnings}
      icon={<AlertTriangle className="h-5 w-5" />}
      description="Potential operational issues"
    />

    <HealthCard
      title="Avg Response"
      value={`${stats.avgPerf}ms`}
      icon={<Clock3 className="h-5 w-5" />}
      description="Average measured timing"
    />

    <HealthCard
      title="Connection"
      value={online ? "Online" : "Offline"}
      icon={<Wifi className="h-5 w-5" />}
      description="Current browser network state"
    />
  </div>

  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <Card className="xl:col-span-2 rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Recent Diagnostic Events
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-3 max-h-[600px] overflow-auto pr-1">
          {recentEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No diagnostic events recorded yet.
            </div>
          ) : (
            recentEntries.map((entry, index) => (
              <div
                key={index}
                className="border rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={
                        entry.level === "error"
                          ? "destructive"
                          : entry.level === "warn"
                          ? "secondary"
                          : "default"
                      }
                    >
                      {entry.level}
                    </Badge>

                    <Badge variant="outline">{entry.area}</Badge>

                    <span className="font-medium">{entry.name}</span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.t).toLocaleTimeString()}
                  </div>
                </div>

                {entry.durationMs !== undefined && (
                  <div className="text-sm">
                    Duration: <strong>{entry.durationMs}ms</strong>
                  </div>
                )}

                {entry.data && (
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                )}

                {entry.hint && (
                  <div className="text-sm border-l-2 pl-3 text-amber-600">
                    {entry.hint}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>

    <div className="space-y-6">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <StatusRow
            label="Application"
            ok={healthStatus !== "critical"}
          />

          <StatusRow
            label="Browser Connectivity"
            ok={online}
          />

          <StatusRow
            label="Diagnostics Engine"
            ok={true}
          />

          <StatusRow
            label="Slow Queries"
            ok={stats.slowQueries === 0}
            value={stats.slowQueries}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Runtime Snapshot</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current Route</span>
            <span>{window.location.pathname}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">Timestamp</span>
            <span>{new Date(now).toLocaleTimeString()}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">Diagnostics Enabled</span>
            <span>Yes</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">Buffered Events</span>
            <span>{entries.length}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</div>

); }

function HealthCard({ title, value, icon, description, }: { title: string; value: string | number; icon: React.ReactNode; description: string; }) { return ( <Card className="rounded-2xl shadow-sm"> <CardContent className="p-5"> <div className="flex items-start justify-between"> <div> <p className="text-sm text-muted-foreground">{title}</p> <h2 className="text-2xl font-bold mt-1">{value}</h2> </div>

<div className="opacity-70">{icon}</div>
    </div>

    <p className="text-xs text-muted-foreground mt-3">
      {description}
    </p>
  </CardContent>
</Card>

); }

function StatusRow({ label, ok, value, }: { label: string; ok: boolean; value?: string | number; }) { return ( <div className="flex items-center justify-between border rounded-lg px-3 py-2"> <div className="flex items-center gap-2"> {ok ? ( <CheckCircle2 className="h-4 w-4 text-green-600" /> ) : ( <AlertTriangle className="h-4 w-4 text-red-600" /> )}

<span className="text-sm">{label}</span>
  </div>

  <span className="text-sm font-medium">
    {value ?? (ok ? "OK" : "Attention")}
  </span>
</div>

); }
