import OptoLoader from "@/components/OptoLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { CalendarIcon, Plus, X, Clock, CheckCircle2, XCircle, AlertCircle, Bell, BellRing, Pencil, UserRound, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useAccessClinic } from "@/hooks/useAccess";
import { diag } from "@/lib/diag";
import { offlineStore } from "@/lib/offlineStore";
import { useOffline } from "@/hooks/useOffline";

interface Appointment {
  id: string;
  patient_id: string | null;
  appointment_date: string;
  appointment_time: string | null;
  reason: string | null;
  status: string;
  source: string;
  clinic_id: string | null;
  doctor_id?: string | null;
  visit_id?: string | null;
  priority?: string | null;
  reminder_sent_at?: string | null;
  reminder_channel?: string | null;
  patient_name?: string;
}

type PatientLite = { id: string; full_name: string };

export default function Appointments() {
  // Gate on auth/clinic hydration so we don't fire queries without context.
  const { effectiveClinicId, profileLoading, clinicLoading } = useAccessClinic();
  const cid = effectiveClinicId;
  const hydrating = profileLoading || clinicLoading;
  const { isOffline } = useOffline();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState<Date>(new Date());
  const [form, setForm] = useState({ patientId: "", date: new Date(), time: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filterDateStr = useMemo(() => format(filterDate, "yyyy-MM-dd"), [filterDate]);

  // ── Appointments fetch ─────────────────────────────────────────────────
  // Explicit clinic_id filter + date filter. Isolated from patient lookup
  // so a patient-lookup failure never blanks the appointments list.
  const loadAppointments = useCallback(async (signal?: AbortSignal) => {
    if (!cid) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const cacheKey = `appointments:${cid}`;
    const loadFromCache = () => {
      const cached = offlineStore.get<Appointment[]>(cacheKey);
      if (cached) setAppointments(cached.filter(a => a.appointment_date >= filterDateStr));
      setLoading(false);
    };

    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      loadFromCache();
      return;
    }

    try {
      const end = diag.time("query", "appointments.list", { clinic_id: cid, from: filterDateStr });
      const { data, error: qErr } = await apiClient
        .from("appointments")
        .select("id, patient_id, appointment_date, appointment_time, reason, status, source, clinic_id, doctor_id, visit_id, priority, reminder_sent_at, reminder_channel")
        .eq("clinic_id", cid)
        .gte("appointment_date", filterDateStr)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true })
        .limit(500);
      end({ status: qErr ? "error" : "ok", count: data?.length ?? 0 });

      if (signal?.aborted) return;

      if (qErr) {
        diag.error("query", "appointments.list failed", qErr, { clinic_id: cid });
        loadFromCache();
        return;
      }

      const rows = (data ?? []) as Appointment[];

      let nameMap = new Map<string, string>();
      const patientIds = Array.from(new Set(rows.map(r => r.patient_id).filter((x): x is string => !!x)));
      if (patientIds.length > 0) {
        const { data: pats, error: pErr } = await apiClient
          .from("patients")
          .select("id, full_name")
          .eq("clinic_id", cid)
          .in("id", patientIds);
        if (pErr) {
          diag.warn("query", "patient name lookup failed", { message: pErr.message, code: pErr.code });
        } else if (pats) {
          nameMap = new Map((pats as PatientLite[]).map(p => [p.id, p.full_name]));
        }
      }

      if (signal?.aborted) return;
      const enriched = rows.map(r => ({
        ...r,
        patient_name: r.patient_id ? (nameMap.get(r.patient_id) ?? "Unknown patient") : "Walk-in",
      }));
      setAppointments(enriched);
      offlineStore.save(cacheKey, enriched);
      setLoading(false);
    } catch (e: any) {
      diag.error("query", "appointments.list threw", e, { clinic_id: cid });
      loadFromCache();
    }
  }, [cid, filterDateStr, isOffline]);

  useEffect(() => {
    if (hydrating) return;
    const ctrl = new AbortController();
    loadAppointments(ctrl.signal);
    return () => ctrl.abort();
  }, [hydrating, loadAppointments]);

  // Refresh appointments after offline sync completes for this clinic
  useEffect(() => {
    function onSync(e: Event) {
      const ev = e as CustomEvent<{ clinicId: string }>;
      const clinicFromEvent = ev?.detail?.clinicId;
      if (!clinicFromEvent || clinicFromEvent !== cid) return;
      loadAppointments();
    }
    window.addEventListener("optocare:sync:done", onSync as EventListener);
    return () => window.removeEventListener("optocare:sync:done", onSync as EventListener);
  }, [cid, loadAppointments]);

  // ── Patient dropdown ───────────────────────────────────────────────────
  useEffect(() => {
    if (hydrating || !cid) { setPatients([]); return; }
    const cacheKey = `patients-lite:${cid}`;
    let cancelled = false;
    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      const cached = offlineStore.get<PatientLite[]>(cacheKey);
      if (cached) setPatients(cached);
      return;
    }
    (async () => {
      try {
        const { data, error: pErr } = await apiClient
          .from("patients")
          .select("id, full_name")
          .eq("clinic_id", cid)
          .order("full_name")
          .limit(500);
        if (cancelled) return;
        if (pErr || !data) {
          const cached = offlineStore.get<PatientLite[]>(cacheKey);
          if (cached) setPatients(cached);
          return;
        }
        const rows = data as PatientLite[];
        setPatients(rows);
        offlineStore.save(cacheKey, rows);
      } catch {
        const cached = offlineStore.get<PatientLite[]>(cacheKey);
        if (cached) setPatients(cached);
      }
    })();
    return () => { cancelled = true; };
  }, [hydrating, cid, isOffline]);

  const startEdit = (a: Appointment) => {
    setEditingId(a.id);
    setForm({
      patientId: a.patient_id || "",
      date: new Date(a.appointment_date + "T00:00:00"),
      time: a.appointment_time || "",
      reason: a.reason || "",
    });
    setShowForm(true);
  };

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      today: appointments.filter(a => a.appointment_date === today && a.status !== "cancelled").length,
      pending: appointments.filter(a => a.status === "pending").length,
      confirmed: appointments.filter(a => a.status === "confirmed").length,
      reminders: appointments.filter(a => a.status !== "cancelled" && a.status !== "completed" && !a.reminder_sent_at).length,
    };
  }, [appointments]);

  // ── Mutations ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!cid) { toast.error("No active clinic selected"); return; }
    if (!form.time?.trim()) { toast.error("Set a time"); return; }
    const payload = {
      clinic_id: cid,
      patient_id: form.patientId || null,
      appointment_date: format(form.date, "yyyy-MM-dd"),
      appointment_time: form.time,
      reason: form.reason || null,
      status: "pending",
      source: "manual",
    };
    const offline = isOffline || (typeof navigator !== "undefined" && !navigator.onLine);
    if (offline) {
      const queueKey = `appointments-queue:${cid}`;
      const queue = offlineStore.get<any[]>(queueKey) ?? [];
      queue.push({ ...payload, queued_at: Date.now() });
      offlineStore.save(queueKey, queue);
      toast.success("Saved offline — will sync automatically");
      setShowForm(false);
      setForm({ patientId: "", date: new Date(), time: "", reason: "" });
      return;
    }
    setSaving(true);
    const result = editingId
      ? await apiClient.from("appointments").update(payload as any).eq("clinic_id", cid).eq("id", editingId)
      : await apiClient.from("appointments").insert(payload as any);
    const insErr = result.error;
    setSaving(false);
    if (insErr) {
      diag.error("query", "appointment insert failed", insErr, { clinic_id: cid });
      toast.error(insErr.message);
      return;
    }
    toast.success(editingId ? "Appointment updated" : "Appointment scheduled");
    setEditingId(null);
    setShowForm(false);
    setForm({ patientId: "", date: new Date(), time: "", reason: "" });
    loadAppointments();
  };

  const sendReminder = async (appointment: Appointment) => {
    if (!cid || !appointment.patient_id) {
      toast.error("A patient-linked appointment is required for reminders.");
      return;
    }
    setRemindingId(appointment.id);
    try {
      const { data: patient, error } = await apiClient
        .from("patients")
        .select("id, full_name, phone")
        .eq("clinic_id", cid)
        .eq("id", appointment.patient_id)
        .maybeSingle();
      if (error || !patient) {
        toast.error(error?.message || "Patient not found.");
        return;
      }
      const phone = String(patient.phone || "").replace(/[^0-9]/g, "");
      if (!phone) { toast.error("This patient has no phone number saved."); return; }
      const dateLabel = new Date(appointment.appointment_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const message = "Hello " + patient.full_name + ", this is a reminder from the clinic about your appointment on " + dateLabel + (appointment.appointment_time ? " at " + appointment.appointment_time : "") + ". Please arrive 10 minutes early. If you need to reschedule, please contact the clinic.";
      window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
      const { error: trackError } = await apiClient.from("appointments").update({ reminder_sent_at: new Date().toISOString(), reminder_channel: "whatsapp" } as any).eq("clinic_id", cid).eq("id", appointment.id);
      if (trackError) console.warn("Failed to track reminder:", trackError);
      toast.success("WhatsApp reminder opened.");
      loadAppointments();
    } finally { setRemindingId(null); }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!cid) return;
    const { error: uErr } = await apiClient
      .from("appointments")
      .update({ status } as any)
      .eq("clinic_id", cid)
      .eq("id", id);
    if (uErr) {
      diag.error("query", "appointment status update failed", uErr, { id, status });
      toast.error(uErr.message);
      return;
    }
    loadAppointments();
  };

  const statusStyle = (s: string) => {
    if (s === "completed") return "bg-success/10 text-success";
    if (s === "cancelled" || s === "missed") return "bg-destructive/10 text-destructive";
    if (s === "confirmed") return "bg-accent/10 text-accent";
    return "bg-primary/10 text-primary";
  };

  // ── Render ──────────────────────────────────────────────────────────
  const showHydrating = hydrating;
  const showNoClinic = !hydrating && !cid;

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-header">Appointments</h1>
        <Button onClick={() => setShowForm(v => !v)} size="sm" className="rounded-xl gap-1.5" disabled={!cid}>
          {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New</>}
        </Button>
      </div>

      {showForm && cid && (
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
            <Button className="rounded-xl" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : editingId ? "Update appointment" : "Schedule"}</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="medical-card p-3"><p className="text-[10px] text-muted-foreground">Today</p><p className="text-xl font-bold mt-1">{stats.today}</p></div>
        <div className="medical-card p-3"><p className="text-[10px] text-muted-foreground">Pending</p><p className="text-xl font-bold mt-1">{stats.pending}</p></div>
        <div className="medical-card p-3"><p className="text-[10px] text-muted-foreground">Confirmed</p><p className="text-xl font-bold mt-1">{stats.confirmed}</p></div>
        <div className="medical-card p-3"><p className="text-[10px] text-muted-foreground">Reminder due</p><p className="text-xl font-bold mt-1">{stats.reminders}</p></div>
      </div>

      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xs text-muted-foreground">Showing appointments from {format(filterDate, "PPP")} onward</p>
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

      {showHydrating ? (
        <div className="flex items-center justify-center py-12">
          <OptoLoader size={40} />
        </div>
      ) : showNoClinic ? (
        <div className="form-section flex items-start gap-3 text-sm">
          <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">No active clinic</div>
            <div className="text-muted-foreground">Select a clinic to view appointments.</div>
          </div>
        </div>
      ) : error ? (
        <div className="form-section flex items-start gap-3 text-sm border-destructive/40">
          <AlertCircle size={18} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium text-destructive">Couldn't load appointments</div>
            <div className="text-muted-foreground break-words">{error}</div>
            <Button size="sm" variant="outline" className="mt-2 rounded-xl" onClick={() => loadAppointments()}>Retry</Button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <OptoLoader size={40} />
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No upcoming appointments.</div>
      ) : (
        <div className="space-y-2">
          {appointments.map(a => (
            <div key={a.id} className="medical-card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => a.patient_id && (window.location.href = "/patient/" + a.patient_id)}>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0"><Clock size={17} className="text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{a.appointment_time ?? "—"}</span>
                    <span className="text-sm font-semibold truncate">{a.patient_name}</span>
                    <span className={`text-[10px] px-2 py-1 rounded-full capitalize ${statusStyle(a.status)}`}>{a.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{a.appointment_date}{a.reason ? " • " + a.reason : ""}</p>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {a.reminder_sent_at ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-success/10 text-success"><Bell size={11} /> Reminder sent</span> : <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700"><BellRing size={11} /> Reminder due</span>}
                    {a.source === "auto" && <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary">From visit</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {(a.status === "pending" || a.status === "confirmed") && <>
                    <button onClick={() => updateStatus(a.id, "completed")} className="p-2 rounded-xl hover:bg-muted" title="Mark appointment as completed"><CheckCircle2 size={16} className="text-success" /></button>
                    <button onClick={() => updateStatus(a.id, "cancelled")} className="p-2 rounded-xl hover:bg-muted" title="Cancel appointment"><XCircle size={16} className="text-destructive" /></button>
                  </>}
                  <button onClick={() => startEdit(a)} className="p-2 rounded-xl hover:bg-muted" title="Edit appointment"><Pencil size={16} /></button>
                  <button onClick={() => sendReminder(a)} disabled={remindingId === a.id || a.status === "cancelled" || a.status === "completed"} className="p-2 rounded-xl hover:bg-muted disabled:opacity-50" title={a.reminder_sent_at ? "Resend appointment reminder on WhatsApp" : "Send appointment reminder on WhatsApp"}>{remindingId === a.id ? <Clock size={16} className="text-primary animate-spin" /> : <Bell size={16} className="text-primary" />}</button>
                </div>
              </div>
              {a.patient_id && <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground"><UserRound size={11} /> Open patient record <ChevronRight size={11} /></div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
