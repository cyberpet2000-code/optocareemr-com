import { useState, useEffect } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { CalendarIcon, Plus, X, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useAccess } from "@/hooks/useAccess";

interface Appointment {
  id: string;
  patient_id: string | null;
  appointment_date: string;
  appointment_time: string;
  reason: string | null;
  status: string;
  source: string;
  patient_name?: string;
}

export default function Appointments() {
  const { effectiveClinicId: cid } = useAccess();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState<Date>(new Date());
  const [form, setForm] = useState({ patientId: "", date: new Date(), time: "", reason: "" });
  const [saving, setSaving] = useState(false);

  const loadAppointments = async () => {
    if (!cid) { setAppointments([]); setLoading(false); return; }
    setLoading(true);
    const dateStr = format(filterDate, "yyyy-MM-dd");
    const { data } = await apiClient
      .from("appointments")
      .select("*")
      .eq("clinic_id", cid)
      .eq("appointment_date", dateStr)
      .order("appointment_time");
    console.debug("[appointments]", { clinic_id: cid, count: data?.length ?? 0 });
    if (data && data.length > 0) {
      const patientIds = [...new Set(data.filter((a: any) => a.patient_id).map((a: any) => a.patient_id))];
      let patMap = new Map<string, string>();
      if (patientIds.length > 0) {
        const { data: pats } = await apiClient.from("patients").select("id, full_name").eq("clinic_id", cid).in("id", patientIds as string[]);
        patMap = new Map((pats || []).map((p: any) => [p.id, p.full_name]));
      }
      setAppointments(data.map((a: any) => ({ ...a, patient_name: a.patient_id ? patMap.get(a.patient_id) || "Unknown" : "Walk-in" })));
    } else {
      setAppointments([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadAppointments(); }, [filterDate, cid]);
  useEffect(() => {
    if (!cid) { setPatients([]); return; }
    apiClient.from("patients").select("id, full_name").eq("clinic_id", cid).order("full_name").then(({ data }) => {
      if (data) setPatients(data as any);
    });
  }, [cid]);

  const handleSubmit = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    if (!form.time) { toast.error("Set a time"); return; }
    setSaving(true);
    const { error } = await apiClient.from("appointments").insert({
      clinic_id: cid,
      patient_id: form.patientId || null,
      appointment_date: format(form.date, "yyyy-MM-dd"),
      appointment_time: form.time,
      reason: form.reason || null,
      status: "pending",
      source: "manual",
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Appointment scheduled");
    setShowForm(false);
    setForm({ patientId: "", date: new Date(), time: "", reason: "" });
    loadAppointments();
  };

  const updateStatus = async (id: string, status: string) => {
    if (!cid) return;
    await apiClient.from("appointments").update({ status } as any).eq("clinic_id", cid).eq("id", id);
    loadAppointments();
  };

  const statusStyle = (s: string) => {
    if (s === "completed") return "bg-success/10 text-success";
    if (s === "cancelled" || s === "missed") return "bg-destructive/10 text-destructive";
    if (s === "confirmed") return "bg-accent/10 text-accent";
    return "bg-primary/10 text-primary";
  };

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-header">Appointments</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="rounded-xl gap-1.5">
          {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New</>}
        </Button>
      </div>

      {showForm && (
        <div className="form-section mb-5 max-w-lg animate-fade-in">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Patient (optional)</Label>
              <Select value={form.patientId} onValueChange={v => setForm(f => ({ ...f, patientId: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Walk-in" /></SelectTrigger>
                <SelectContent>
                  {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal rounded-xl text-sm">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {format(form.date, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.date} onSelect={d => d && setForm(f => ({ ...f, date: d }))} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Input type="time" className="rounded-xl" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Textarea className="rounded-xl" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
            </div>
            <Button className="rounded-xl" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Schedule"}</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl">
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {format(filterDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterDate} onSelect={d => d && setFilterDate(d)} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No appointments for this date.</div>
      ) : (
        <div className="space-y-2">
          {appointments.map(a => (
            <div key={a.id} className="medical-card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Clock size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold">{a.appointment_time}</span>
                  <span className="text-sm font-medium truncate">{a.patient_name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${statusStyle(a.status)}`}>{a.status}</span>
                  {a.source === "auto" && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md">auto</span>}
                </div>
                {a.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.reason}</p>}
              </div>
              {(a.status === "pending" || a.status === "confirmed") && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => updateStatus(a.id, "completed")} className="p-2 rounded-xl hover:bg-muted transition-colors">
                    <CheckCircle2 size={16} className="text-success" />
                  </button>
                  <button onClick={() => updateStatus(a.id, "cancelled")} className="p-2 rounded-xl hover:bg-muted transition-colors">
                    <XCircle size={16} className="text-destructive" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
