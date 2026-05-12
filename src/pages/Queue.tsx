import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, ChevronRight, Clock, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";

interface QPatient {
  id: string;
  full_name: string;
  queue_number: number;
  queue_status: string;
  priority: string;
  payment_type: string;
  phone: string;
  age: number | null;
  gender: string | null;
  created_at: string;
}

const STATUSES = ["waiting", "in_consultation", "with_doctor", "billing", "completed"] as const;
const STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting",
  in_consultation: "In Consultation",
  with_doctor: "With Doctor",
  billing: "Billing",
  completed: "Completed",
};
const STATUS_COLOR: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  in_consultation: "bg-accent/10 text-accent",
  with_doctor: "bg-primary/10 text-primary",
  billing: "bg-secondary text-secondary-foreground",
  completed: "bg-success/10 text-success",
};
const PRIORITY_COLOR: Record<string, string> = {
  emergency: "bg-destructive/10 text-destructive border-destructive/30",
  urgent: "bg-warning/10 text-warning border-warning/30",
  normal: "bg-muted text-muted-foreground border-border",
};

export default function Queue() {
  const { effectiveClinicId: cid } = useAccess();
  const [patients, setPatients] = useState<QPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("active");

  const load = async () => {
    if (!cid) { setPatients([]); setLoading(false); return; }
    const { data } = await apiClient
      .from("patients")
      .select("id, full_name, queue_number, queue_status, priority, payment_type, phone, age, gender, created_at")
      .eq("clinic_id", cid)
      .order("priority", { ascending: false })
      .order("queue_number", { ascending: true });
    console.debug("[queue]", { clinic_id: cid, count: data?.length ?? 0 });
    setPatients((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!cid) return;
    const channel = apiClient
      .channel(`queue-realtime-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "patients", filter: `clinic_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => { apiClient.removeChannel(channel); };
  }, [cid]);

  const updateStatus = async (id: string, status: string) => {
    if (!cid) return;
    const { error } = await apiClient.from("patients").update({ queue_status: status } as any).eq("clinic_id", cid).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
  };

  const updatePriority = async (id: string, priority: string) => {
    if (!cid) return;
    const { error } = await apiClient.from("patients").update({ priority } as any).eq("clinic_id", cid).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Priority updated");
  };

  const filtered = patients.filter(p => {
    if (filter === "active") return p.queue_status !== "completed";
    if (filter === "all") return true;
    return p.queue_status === filter;
  });

  const counts = {
    waiting: patients.filter(p => p.queue_status === "waiting").length,
    inProgress: patients.filter(p => ["in_consultation", "with_doctor", "billing"].includes(p.queue_status)).length,
    completed: patients.filter(p => p.queue_status === "completed").length,
  };

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-header">Patient Queue</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Live triage and flow</p>
        </div>
        <Button size="sm" variant="ghost" className="rounded-xl" onClick={load}>
          <RefreshCw size={14} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
            <Clock size={16} className="text-warning" />
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-medium">Waiting</p>
            <p className="text-lg font-bold">{counts.waiting}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <AlertCircle size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-medium">Active</p>
            <p className="text-lg font-bold">{counts.inProgress}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
            <CheckCircle2 size={16} className="text-success" />
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-medium">Done</p>
            <p className="text-lg font-bold">{counts.completed}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {["active", "all", ...STATUSES].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-xl font-medium capitalize transition-all ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}>
            {f === "active" ? "Active" : f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users size={32} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No patients in queue.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className={`medical-card p-3 border-l-4 ${PRIORITY_COLOR[p.priority] || PRIORITY_COLOR.normal}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[9px] text-muted-foreground font-medium">#</span>
                  <span className="text-sm font-bold text-primary leading-none">{p.queue_number}</span>
                </div>
                <Link to={`/patient/${p.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{p.full_name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium uppercase ${STATUS_COLOR[p.queue_status] || ""}`}>
                      {STATUS_LABEL[p.queue_status] || p.queue_status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.gender}, {p.age} yrs • {p.payment_type === "hmo" ? "HMO" : "Private"}
                  </p>
                </Link>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Select value={p.queue_status} onValueChange={v => updateStatus(p.id, v)}>
                  <SelectTrigger className="rounded-xl h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={p.priority} onValueChange={v => updatePriority(p.id, v)}>
                  <SelectTrigger className="rounded-xl h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
