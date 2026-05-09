import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { Mail, MessageCircle, AlertTriangle, CheckCircle2, RefreshCw, Send, ShieldCheck, Eye, MousePointerClick, Ban } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Log = {
  id: string;
  clinic_id: string | null;
  recipient: string;
  channel: string;
  notification_type: string;
  subject: string | null;
  status: string;
  provider: string | null;
  error_message: string | null;
  attempts: number | null;
  sent_at: string | null;
};

export default function Communications() {
  const { effectiveClinicId } = useClinic();
  const { isSuperAdmin } = useRole();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    let q = supabase.from("notification_logs" as any)
      .select("*").order("sent_at", { ascending: false }).limit(200);
    if (!isSuperAdmin && effectiveClinicId) q = q.eq("clinic_id", effectiveClinicId);
    const { data, error } = await q;
    if (error) toast({ title: "Failed to load logs", description: error.message, variant: "destructive" });
    setLogs((data as any[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveClinicId, isSuperAdmin]);

  const stats = useMemo(() => {
    const total = logs.length;
    const sent = logs.filter(l => l.status === "sent" || l.status === "success").length;
    const failed = logs.filter(l => l.status === "failed").length;
    const email = logs.filter(l => l.channel === "email").length;
    const wa = logs.filter(l => l.channel === "whatsapp").length;
    const rate = total ? Math.round((sent / total) * 100) : 0;
    return { total, sent, failed, email, wa, rate };
  }, [logs]);

  async function runNow() {
    setRunning(true);
    try {
      const body: any = isSuperAdmin ? {} : { clinic_id: effectiveClinicId };
      const { data, error } = await supabase.functions.invoke("send-daily-summary", { body });
      if (error) throw error;
      toast({ title: "Daily summary triggered", description: `Processed ${data?.processed ?? 0} clinic(s).` });
      await load();
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const Card = ({ icon: Icon, label, value, tone }: any) => (
    <div className="form-section flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone || "bg-primary/10 text-primary"}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Communications</h1>
          <p className="text-sm text-muted-foreground">Email & messaging delivery for your clinic</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={runNow} disabled={running} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
            <Send size={14} /> {running ? "Sending…" : "Send daily summary now"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card icon={Mail} label="Total emails" value={stats.email} />
        <Card icon={MessageCircle} label="WhatsApp" value={stats.wa} tone="bg-success/10 text-success" />
        <Card icon={CheckCircle2} label="Delivery rate" value={`${stats.rate}%`} tone="bg-success/10 text-success" />
        <Card icon={AlertTriangle} label="Failed" value={stats.failed} tone="bg-destructive/10 text-destructive" />
      </div>

      <div className="form-section overflow-x-auto">
        <h2 className="font-semibold mb-3">Recent notifications</h2>
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No notifications yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Channel</th>
                <th className="py-2 pr-3">Recipient</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Attempts</th>
                <th className="py-2 pr-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 whitespace-nowrap">{l.sent_at ? new Date(l.sent_at).toLocaleString() : "—"}</td>
                  <td className="py-2 pr-3">{l.notification_type}</td>
                  <td className="py-2 pr-3 capitalize">{l.channel}</td>
                  <td className="py-2 pr-3">{l.recipient}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      l.status === "sent" || l.status === "success" ? "bg-success/10 text-success" :
                      l.status === "failed" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>{l.status}</span>
                  </td>
                  <td className="py-2 pr-3">{l.attempts ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground max-w-xs truncate" title={l.error_message || ""}>{l.error_message || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
