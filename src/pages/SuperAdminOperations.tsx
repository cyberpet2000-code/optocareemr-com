import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle2, Wrench, Power, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type Clinic = {
  id: string;
  name: string;
  subscription_status: string | null;
  trial_end_date: string | null;
  is_active: boolean | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  created_at: string;
};

type Score = {
  clinic_id: string;
  score: number;
  status: "healthy" | "at_risk" | "critical";
  factors: Record<string, number> | null;
  insights: string[] | null;
  calculated_at: string;
};

type FixLog = { clinic_id: string | null; issue_detected: string; action_taken: string; status: string; created_at: string };

const STATUS_COLOR: Record<string, string> = {
  healthy: "bg-success/10 text-success",
  at_risk: "bg-warning/10 text-warning",
  critical: "bg-destructive/10 text-destructive",
};

function lifecycleBadge(c: Clinic): { label: string; className: string } {
  if (c.is_active === false) {
    if (c.deactivation_reason === "trial_expired" || c.subscription_status === "expired")
      return { label: "Expired 🔴", className: "bg-destructive/10 text-destructive" };
    return { label: "Suspended ⚫", className: "bg-muted text-foreground" };
  }
  if (c.subscription_status === "active")
    return { label: "Subscription Active 🟢", className: "bg-success/10 text-success" };
  const days = c.trial_end_date
    ? Math.ceil((new Date(c.trial_end_date).getTime() - Date.now()) / 86400000)
    : null;
  if (days !== null && days <= 3 && days >= 0)
    return { label: "Trial Expiring Soon 🟡", className: "bg-warning/10 text-warning" };
  return { label: "Trial Active 🟢", className: "bg-primary/10 text-primary" };
}

export default function SuperAdminOperations() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [fixLogs, setFixLogs] = useState<FixLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: cList }, { data: sList }, { data: lList }] = await Promise.all([
      apiClient
        .from("clinics")
        .select("id,name,subscription_status,trial_end_date,is_active,deactivated_at,deactivation_reason,created_at")
        .order("created_at", { ascending: false }),
      apiClient.from("clinic_success_scores").select("clinic_id,score,status,factors,insights,calculated_at"),
      apiClient
        .from("auto_fix_logs")
        .select("clinic_id,issue_detected,action_taken,status,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setClinics((cList as Clinic[]) || []);
    const map: Record<string, Score> = {};
    (sList as Score[] | null)?.forEach((s) => (map[s.clinic_id] = s));
    setScores(map);
    setFixLogs((lList as FixLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const callRpc = async (fn: "calculate_clinic_success_score" | "run_auto_fix" | "activate_clinic_subscription" | "deactivate_clinic", clinic_id: string, extra?: Record<string, unknown>) => {
    setBusyId(clinic_id + ":" + fn);
    const args: Record<string, unknown> = { _clinic_id: clinic_id, ...(extra || {}) };
    // @ts-expect-error generic rpc
    const { data, error } = await apiClient.rpc(fn, args);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return null;
    }
    return data;
  };

  const recalc = async (id: string) => {
    const r = await callRpc("calculate_clinic_success_score", id);
    if (r) {
      toast.success(`Score recalculated`);
      load();
    }
  };
  const fix = async (id: string) => {
    const r = await callRpc("run_auto_fix", id);
    if (r) {
      const fixes = (r as any)?.fixes_applied ?? 0;
      toast.success(`Auto-fix complete — ${fixes} action(s)`);
      load();
    }
  };
  const activate = async (id: string) => {
    const r = await callRpc("activate_clinic_subscription", id);
    if (r) {
      toast.success("Clinic activated");
      load();
    }
  };
  const deactivate = async (id: string) => {
    if (!confirm("Deactivate this clinic? Users will lose access until a subscription is activated.")) return;
    const r = await callRpc("deactivate_clinic", id, { _reason: "manual" });
    if (r) {
      toast.success("Clinic deactivated");
      load();
    }
  };

  const stats = useMemo(() => {
    const total = clinics.length;
    const atRisk = Object.values(scores).filter((s) => s.status !== "healthy").length;
    const today = new Date().toISOString().slice(0, 10);
    const fixedToday = fixLogs.filter((l) => l.created_at.slice(0, 10) === today && l.status === "success").length;
    const expiredToday = clinics.filter(
      (c) => c.deactivated_at && c.deactivated_at.slice(0, 10) === today && c.deactivation_reason === "trial_expired"
    ).length;
    const trialTotal = clinics.filter((c) => c.subscription_status && c.subscription_status !== "active").length + clinics.filter((c) => c.subscription_status === "active").length;
    const paid = clinics.filter((c) => c.subscription_status === "active").length;
    const conversion = trialTotal === 0 ? 0 : Math.round((paid / total) * 100);
    return { total, atRisk, fixedToday, expiredToday, conversion };
  }, [clinics, scores, fixLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-primary" size={22} /> Operations Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Clinic Success Scores, Auto-Fix actions, and Subscription lifecycle
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw size={14} className="mr-1" /> Refresh
        </Button>
      </div>

      {/* Intelligence panel */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Clinics" value={stats.total} icon={<Activity size={16} />} />
        <StatCard label="At Risk" value={stats.atRisk} icon={<AlertTriangle size={16} />} tone="warning" />
        <StatCard label="Auto-Fixed Today" value={stats.fixedToday} icon={<Wrench size={16} />} tone="success" />
        <StatCard label="Expired Today" value={stats.expiredToday} icon={<Power size={16} />} tone="destructive" />
        <StatCard label="Trial → Paid" value={`${stats.conversion}%`} icon={<TrendingUp size={16} />} tone="primary" />
      </div>

      {/* Clinics table */}
      <div className="form-section overflow-x-auto">
        <h2 className="font-semibold mb-3">Clinics</h2>
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : clinics.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No clinics yet.</div>
        ) : (
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 pr-3">Clinic</th>
                <th className="py-2 pr-3">Lifecycle</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">Insight</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clinics.map((c) => {
                const s = scores[c.id];
                const lc = lifecycleBadge(c);
                const insight = s?.insights?.[0] || (s ? "All factors healthy" : "Score not calculated yet");
                return (
                  <tr key={c.id} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-3 font-medium">{c.name}</td>
                    <td className="py-3 pr-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-md ${lc.className}`}>{lc.label}</span>
                    </td>
                    <td className="py-3 pr-3">
                      {s ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-semibold">{s.score}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLOR[s.status]}`}>{s.status}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted-foreground max-w-[260px]">{insight}</td>
                    <td className="py-3 pr-3 text-right">
                      <div className="inline-flex flex-wrap gap-1.5 justify-end">
                        <Button size="sm" variant="outline" onClick={() => recalc(c.id)} disabled={!!busyId}>
                          <RefreshCw size={12} className="mr-1" /> Score
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => fix(c.id)} disabled={!!busyId}>
                          <Wrench size={12} className="mr-1" /> Auto-Fix
                        </Button>
                        {c.is_active ? (
                          <Button size="sm" variant="destructive" onClick={() => deactivate(c.id)} disabled={!!busyId}>
                            <Power size={12} className="mr-1" /> Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => activate(c.id)} disabled={!!busyId}>
                            <CheckCircle2 size={12} className="mr-1" /> Activate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent auto-fix actions */}
      <div className="form-section">
        <h2 className="font-semibold mb-3">Recent Auto-Fix Actions</h2>
        {fixLogs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No auto-fix actions yet.</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {fixLogs.slice(0, 15).map((l, i) => (
              <li key={i} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.issue_detected}</div>
                  <div className="text-xs text-muted-foreground">{l.action_taken}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      l.status === "success"
                        ? "bg-success/10 text-success"
                        : l.status === "flagged"
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {l.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "muted",
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "muted" | "success" | "warning" | "destructive" | "primary";
}) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <div className="form-section flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
}
