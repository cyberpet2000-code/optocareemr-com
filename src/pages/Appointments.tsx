import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
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
import { cn } from "@/lib/utils";

interface Appointment {
  id: string;
  patient_id: number | null;
  appointment_date: string;
  appointment_time: string;
  reason: string | null;
  status: string;
  created_at: string;
  patient_name?: string;
}

interface PatientOption {
  id: number;
  full_name: string;
  patient_uid: string;
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState<Date>(new Date());
  const [form, setForm] = useState({ patientId: "", date: new Date(), time: "", reason: "" });
  const [saving, setSaving] = useState(false);

  const loadAppointments = async () => {
    const dateStr = format(filterDate, "yyyy-MM-dd");
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("appointment_date", dateStr)
      .order("appointment_time");
    
    if (data && data.length > 0) {
      const patientIds = [...new Set(data.filter(a => a.patient_id).map(a => a.patient_id))];
      if (patientIds.length > 0) {
        const { data: pats } = await supabase.from("Patients").select("id, full_name").in("id", patientIds as number[]);
        const patMap = new Map((pats || []).map(p => [p.id, p.full_name]));
        setAppointments(data.map(a => ({ ...a, patient_name: a.patient_id ? patMap.get(a.patient_id) || "Unknown" : "Walk-in" })));
      } else {
        setAppointments(data.map(a => ({ ...a, patient_name: "Walk-in" })));
      }
    } else {
      setAppointments([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadAppointments(); }, [filterDate]);

  useEffect(() => {
    supabase.from("Patients").select("id, full_name, patient_uid").order("full_name").then(({ data }) => {
      if (data) setPatients(data as unknown as PatientOption[]);
    });
  }, []);

  const handleSubmit = async () => {
    if (!form.time) { toast.error("Please set a time"); return; }
    setSaving(true);
    const { error } = await supabase.from("appointments").insert({
      patient_id: form.patientId ? parseInt(form.patientId) : null,
      appointment_date: format(form.date, "yyyy-MM-dd"),
      appointment_time: form.time,
      reason: form.reason || null,
      status: "scheduled",
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Appointment scheduled");
    setShowForm(false);
    setForm({ patientId: "", date: new Date(), time: "", reason: "" });
    loadAppointments();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("appointments").update({ status } as any).eq("id", id);
    loadAppointments();
  };

  const statusColor = (s: string) => {
    if (s === "completed") return "bg-success/10 text-success";
    if (s === "cancelled") return "bg-destructive/10 text-destructive";
    return "bg-primary/10 text-primary";
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header">Appointments</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          {showForm ? <><X size={14} className="mr-1" /> Cancel</> : <><Plus size={14} className="mr-1" /> New Appointment</>}
        </Button>
      </div>

      {showForm && (
        <div className="form-section mb-6 max-w-lg">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Patient (optional)</Label>
              <Select value={form.patientId} onValueChange={v => setForm(f => ({ ...f, patientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Walk-in" /></SelectTrigger>
                <SelectContent>
                  {patients.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.full_name} ({p.patient_uid})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(form.date, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.date} onSelect={d => d && setForm(f => ({ ...f, date: d }))} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} maxLength={300} />
            </div>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Schedule Appointment"}</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Label className="text-sm">Date:</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(filterDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterDate} onSelect={d => d && setFilterDate(d)} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      <div className="medical-card">
        {loading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
        ) : appointments.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No appointments for this date.</p>
        ) : (
          <div className="divide-y divide-border">
            {appointments.map(a => (
              <div key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-muted-foreground" />
                    <span className="font-medium text-sm">{a.appointment_time}</span>
                    <span className="font-medium">{a.patient_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColor(a.status)}`}>{a.status}</span>
                  </div>
                  {a.reason && <p className="text-sm text-muted-foreground ml-6">{a.reason}</p>}
                </div>
                {a.status === "scheduled" && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => updateStatus(a.id, "completed")}>
                      <CheckCircle2 size={16} className="text-success" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => updateStatus(a.id, "cancelled")}>
                      <XCircle size={16} className="text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
