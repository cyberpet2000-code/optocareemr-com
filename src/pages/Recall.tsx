import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, MessageCircle, RefreshCw, Search, Phone, CheckCircle2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useAccess } from "@/hooks/useAccess";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatientWhatsAppMessages } from "@/components/PatientWhatsAppMessages";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type RecallRow = {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_number: string | null;
  phone: string | null;
  due_date: string;
  recall_interval_months: number;
  contact_status: string;
  contacted_at: string | null;
  status: string;
};

const statusLabel = (row: RecallRow, nowMs: number) => {
  const due = new Date(row.due_date + "T00:00:00");
  const now = new Date(nowMs);
  now.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, tone: "bg-red-100 text-red-700" };
  if (days === 0) return { text: "Due today", tone: "bg-amber-100 text-amber-700" };
  if (days === 1) return { text: "Due tomorrow", tone: "bg-amber-100 text-amber-700" };
  return { text: `Due in ${days}d`, tone: days <= 7 ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary" };
};

export default function Recall() {
  const { effectiveClinicId: cid } = useAccess();
  const { isDoctor, isReceptionist, isAdmin, isSuperAdmin } = useRole();
  const [rows, setRows] = useState<RecallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [recallNow, setRecallNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const { data, error } = await apiClient
        .from("patient_recalls")
        .select("id,patient_id,due_date,recall_interval_months,contact_status,contacted_at,status,patients!inner(full_name,patient_number,phone)")
        .eq("clinic_id", cid)
        .eq("status", "active")
        .lte("due_date", new Date(Date.now() + windowDays * 86400000).toISOString().slice(0,10))
        .order("due_date", { ascending: true });
      if (error) throw error;
      setRows((data || []).map((r: any) => ({
        id: r.id, patient_id: r.patient_id, due_date: r.due_date,
        recall_interval_months: Number(r.recall_interval_months || 18),
        contact_status: r.contact_status || "pending", contacted_at: r.contacted_at || null,
        status: r.status, patient_name: r.patients?.full_name || "Patient",
        patient_number: r.patients?.patient_number || null, phone: r.patients?.phone || null,
      })));
    } catch (e: any) {
      toast.error(e?.message || "Unable to load patient recall.");
      setRows([]);
    } finally { setLoading(false); }
  }, [cid, windowDays]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!cid) return;
    const refresh = async () => {
      const { error } = await apiClient.rpc("refresh_patient_recall_notifications", { p_clinic_id: cid });
      if (error) console.warn("Recall notification refresh failed:", error.message);
      await load();
    };
    const id = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(id);
  }, [cid, load]);

  const metrics = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    let overdue=0,dueToday=0,next7=0,next30=0;
    rows.forEach(r => {
      const due = new Date(r.due_date + "T00:00:00");
      const d = Math.round((due.getTime()-today.getTime())/86400000);
      if(d<0) overdue++; else if(d===0) dueToday++; else if(d<=7) next7++; else if(d<=30) next30++;
    });
    return { active: rows.length, overdue, dueToday, next7, next30 };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => `${r.patient_name} ${r.patient_number || ""} ${r.phone || ""}`.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const markContacted = async (row: RecallRow, status: "message_sent" | "called" | "appointment_booked") => {
    const { error } = await apiClient.rpc("mark_patient_recall_contacted", {
      p_clinic_id: cid,
      p_recall_id: row.id,
      p_contact_status: status,
    });
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, contact_status: status, contacted_at: new Date().toISOString() } : r));
  };

  const canOutreach = isDoctor || isReceptionist || isAdmin || isSuperAdmin;

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="page-header">Patient Recall</h1><p className="text-sm text-muted-foreground">Live patients due or overdue for routine eye review.</p></div>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin mr-1.5" : "mr-1.5"} />Refresh</Button>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {[
        ["Active",metrics.active,"bg-primary/10 text-primary"],
        ["Overdue",metrics.overdue,"bg-red-100 text-red-700"],
        ["Due today",metrics.dueToday,"bg-amber-100 text-amber-700"],
        ["Next 7 days",metrics.next7,"bg-amber-50 text-amber-700"],
        ["Next 30 days",metrics.next30,"bg-muted text-foreground"],
      ].map(([label,value,tone]) => <div key={String(label)} className="rounded-2xl border bg-card p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div></div>)}
    </div>

    <div className="rounded-2xl border bg-primary/5 p-3 text-sm flex gap-2 items-start">
      <MessageCircle size={17} className="text-primary mt-0.5 shrink-0" />
      <span><strong>Action:</strong> Patients marked <b>Due today</b> or <b>Overdue</b> should be contacted. Open WhatsApp from the row to send the recall message; OptoCare records the communication after you confirm it was sent.</span>
    </div>

    <div className="flex flex-wrap gap-2">
      <div className="relative flex-1 min-w-[220px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient, number or phone" className="pl-9 rounded-xl" /></div>
      <select value={windowDays} onChange={e=>setWindowDays(Number(e.target.value))} className="rounded-xl border bg-background px-3 text-sm">
        <option value={7}>Due/overdue ≤ 7 days</option><option value={30}>Due/overdue ≤ 30 days</option><option value={90}>Due/overdue ≤ 90 days</option><option value={365}>All due/overdue within 1 year</option>
      </select>
    </div>

    {loading ? <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Loading live recall list…</div> :
      filtered.length === 0 ? <div className="rounded-2xl border bg-card p-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-2 font-medium">No patients due in this window</p><p className="text-sm text-muted-foreground mt-1">The list updates from the current recall records.</p></div> :
      <div className="space-y-2">{filtered.map(row => {
        const st=statusLabel(row, recallNow); const wa=normalizeWhatsAppNumber(row.phone);
        return <div key={row.id} className="rounded-2xl border bg-card p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><Link to={`/patient/${row.patient_id}`} className="font-semibold hover:text-primary">{row.patient_name}</Link>{row.patient_number && <span className="text-[10px] font-mono bg-primary/10 text-primary rounded px-1.5 py-0.5">{row.patient_number}</span>}<span className={`text-[10px] font-semibold rounded-full px-2 py-1 ${st.tone}`}>{st.text}</span></div><div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-2"><span>Recall: {row.recall_interval_months} months</span><span>•</span><span>Due {new Date(row.due_date+"T00:00:00").toLocaleDateString("en-GB")}</span>{row.phone && <><span>•</span><span>{row.phone}</span></>}</div><div className="mt-2 text-[11px]">{row.contact_status === "message_sent" ? "WhatsApp message sent" : row.contact_status === "called" ? "Called" : row.contact_status === "appointment_booked" ? "Appointment booked" : "Not contacted"}</div></div>
          <div className="flex items-center gap-2 flex-wrap">
            {wa && canOutreach && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border bg-green-50 text-green-700 px-3 py-2 text-xs font-semibold"><MessageCircle size={14}/>WhatsApp</a>}
            {row.phone && <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"><Phone size={14}/>Call</a>}
            {canOutreach && <PatientWhatsAppMessages clinicId={cid || ""} clinicName={(window.localStorage.getItem("active_clinic_name") || "Clinic")} patientId={row.patient_id} patientName={row.patient_name} phone={row.phone} defaultTemplateKey="recall_first" onSent={() => markContacted(row,"message_sent")} />}
            {row.contact_status !== "appointment_booked" && <Button size="sm" variant="outline" className="rounded-xl" onClick={()=>void markContacted(row,"appointment_booked")}><CalendarCheck size={14} className="mr-1"/>Appointment booked</Button>}
          </div>
        </div>;
      })}</div>}
  </div>;
}
