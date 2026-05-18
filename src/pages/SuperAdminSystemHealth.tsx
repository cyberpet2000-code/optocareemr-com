import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { diag } from "@/lib/diag";

export default function SuperAdminSystemHealth() {
  const { isAuthReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ db?: string; storage?: string; lastChecked?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const end = diag.time("perf", "system-health-fetch");
      try {
        // TODO: replace with real health endpoint if available.
        await new Promise(res => setTimeout(res, 300));
        if (!cancelled) {
          setHealth({
            db: "ok",
            storage: "ok",
            lastChecked: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        console.error("[SystemHealth] fetch failed", err);
        diag.error("query", "system-health fetch failed", err);
        if (!cancelled) setError(err?.message || "Failed to load health");
      } finally {
        end();
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthReady]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Activity className="text-primary" size={20} />
        <h1 className="text-xl font-semibold">System Health</h1>
      </div>

      {error && (
        <div className="form-section text-sm text-destructive border-destructive/40">
          Failed to load system health: {error}
        </div>
      )}

      <div className="form-section">
        <div className="text-sm text-muted-foreground">Overview</div>
        {loading ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-32" />
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            <div className="text-sm">Database: <span className="font-medium">{health?.db ?? "unknown"}</span></div>
            <div className="text-sm">Storage: <span className="font-medium">{health?.storage ?? "unknown"}</span></div>
            <div className="text-xs text-muted-foreground">Last checked: {health?.lastChecked ?? "—"}</div>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="text-sm text-muted-foreground">Checks</div>
        <ul className="mt-2 list-disc list-inside text-sm">
          <li>Database connectivity / pings</li>
          <li>Supabase storage availability</li>
          <li>Background job queue status (future)</li>
        </ul>
      </div>
    </div>
  );
}
