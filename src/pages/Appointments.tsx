import OptoLoader from "@/components/OptoLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { showNotification } from "@/lib/notifications";
import { normalizeWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { CalendarIcon, Plus, X, Clock, CalendarClock, CheckCircle2, XCircle, AlertCircle, Bell, BellRing, Pencil, UserRound, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useAccessClinic } from "@/hooks/useAccess";
import { diag } from "@/lib/diag";
import { secureOfflineGet, secureOfflineSave } from "@/lib/secureOfflineStore";
import { useOffline } from "@/hooks/useOffline";
import { enqueueOfflineOperation, cacheAppointmentsOffline } from "@/lib/offlineEngine";

interface Appointment {
  id: string;
  patient_id: string | null;
  outreach_lead_id?: string | null;
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
  lead_phone?: string | null;
  is_outreach?: boolean;
}

type PatientLite = { id: string; full_name: string };

export default function Appointments() {
  const { effectiveClinicId, profileLoading, clinicLoading } = useAccessClinic();
  const cid = effectiveClinicId;
  const hydrating = profileLoading || clinicLoading;
  const { isOffline } = useOffline();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState<Date>(new Date());
  const [form, setForm] = useState({ patientId: "", date: new Date(), time: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: new Date(), time: "" });
  const [rescheduling, setRescheduling] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);

  const filterDateStr = useMemo(() => format(filterDate, "yyyy-MM-dd"), [filterDate]);

  const loadAppointments = useCallback(async (signal?: AbortSignal) => {
    if (!cid) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    setError(null);

    const cacheKey = `appointments:${cid}`;
    // Stale-while-revalidate: show the encrypted local schedule immediately,
    // then refresh it in the background. This applies equally to phones,
    // tablets, laptops and desktop browsers.
    const cached = await secureOfflineGet<Appointment[]>(cacheKey);
    if (cached?.length) {
      setAppointments(cached.filter(a => a.appointment_date >= filterDateStr));
      setLoading(false);
    } else {
      setLoading(true);
    }

    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setLoading(false);
      return;
    }

    try {
      const end = diag.time("query", "appointments.list", { clinic_id: cid, from: filterDateStr });
      const { data, error: qErr } = await apiClient
        .from("appointments")
        .select("id, patient_id, outreach_lead_id, appointment_date, appointment_time, reason, status, source, clinic_id, doctor_id, visit_id, priority, reminder_sent_at, reminder_channel")
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
          .from("patients").select("id, full_name").eq("clinic_id", cid).in("id", patientIds);
        if (pErr) diag.warn("query", "patient name lookup failed", { message: pErr.message, code: pErr.code });
        else if (pats) nameMap = new Map((pats as PatientLite[]).map(p => [p.id, p.full_name]));
      }

      const leadIds = Array.from(new Set(rows.map(r => r.outreach_lead_id).filter((x): x is string => !!x)));
      const leadMap = new Map<string, { full_name: string | null; phone: string | null }>();
      if (leadIds.length > 0) {
        const { data: leadRows, error: leadErr } = await apiClient
          .from("outreach_leads").select("id, full_name, phone").eq("clinic_id", cid).in("id", leadIds);
        if (leadErr) diag.warn("query", "outreach lead lookup failed", { message: leadErr.message, code: leadErr.code });
        else for (const lead of leadRows || []) leadMap.set(lead.id, { full_name: lead.full_name, phone: lead.phone });
      }

      if (signal?.aborted) return;
      const enriched = rows.map(r => {
        const lead = r.outreach_lead_id ? leadMap.get(r.outreach_lead_id) : null;
        return {
          ...r,
          patient_name: r.patient_id ? (nameMap.get(r.patient_id) ?? "Unknown patient") : (lead?.full_name || "Outreach lead"),
          lead_phone: lead?.phone || null,
          is_outreach: !!r.outreach_lead_id || r.source === "outreach",
        };
      });
      setAppointments(enriched);
      await secureOfflineSave(cacheKey, enriched);
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

  useEffect(() => {
    if (!cid) return;
    const handleOnline = () => loadAppointments();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [cid, loadAppointments]);

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

  const refreshReminderAlerts = useCallback(async () => {
    if (!cid || isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) return;

    await apiClient.rpc("refresh_due_appointment_reminders");
    const { data, error: reminderError } = await apiClient
      .from("appointment_reminders")
      .select("id, appointment_id, reminder_type, due_at, scheduled_for, status, sent_at, channel")
      .eq("clinic_id", cid)
      .in("status", ["due", "pending", "sent"])
      .gte("scheduled_for", new Date().toISOString())
      .order("due_at", { ascending: true });

    if (reminderError) {
      console.warn("Failed to load appointment reminders:", reminderError);
      return;
    }

    const rows = data || [];
    setReminders(rows);
    const dueRows = rows.filter((r: any) => r.status === "due" && !r.sent_at);
    const alertKey = "optocare:appointment-reminder-alerts:" + cid;
    let alerted: Record<string, boolean> = {};
    try { alerted = JSON.parse(localStorage.getItem(alertKey) || "{}"); } catch { alerted = {}; }

    for (const reminder of dueRows) {
      if (alerted[reminder.id]) continue;
      const appointment = appointments.find(a => a.id === reminder.appointment_id);
      const patientName = appointment?.patient_name || "patient";
      const timing = reminder.reminder_type === "24h" ? "24-hour" : "2-hour";
      const body = timing + " appointment reminder is due for " + patientName +
        (appointment?.appointment_time ? " at " + appointment.appointment_time : "") +
        ". Front desk should open the appointment and send the WhatsApp reminder.";
      showNotification("🔔 Appointment reminder due", body);
      toast.info("Reminder due: " + patientName, { description: "Open Appointments and send the " + timing + " WhatsApp reminder." });
      alerted[reminder.id] = true;
    }

    try { localStorage.setItem(alertKey, JSON.stringify(alerted)); } catch {}
  }, [cid, isOffline, appointments]);

  useEffect(() => {
    if (hydrating || !cid) return;
    refreshReminderAlerts();
    const timer = window.setInterval(refreshReminderAlerts, 60_000);
    return () => window.clearInterval(timer);
  }, [hydrating, cid, refreshReminderAlerts]);

  useEffect(() => {
    if (hydrating || !cid) { setPatients([]); return; }
    const cacheKey = `patients-lite:${cid}`;
    let cancelled = false;
    let timer: number | undefined;

    const searchPatients = async () => {
      if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
        const cached = await secureOfflineGet<PatientLite[]>(cacheKey);
        if (!cancelled && cached) setPatients(cached);
        return;
      }

      setPatientSearchLoading(true);
      try {
        const query = patientSearch.trim();
        let request = apiClient
          .from("patients")
          .select("id, full_name")
          .eq("clinic_id", cid)
          .order("full_name", { ascending: true })
          .limit(25);

        if (query) {
          request = request.ilike("full_name", `%${query.replace(/[%_]/g, "")}%`);
        }

        const { data, error: pErr } = await request;
        if (cancelled) return;

        if (pErr || !data) {
          const cached = await secureOfflineGet<PatientLite[]>(cacheKey);
          if (cached) setPatients(cached);
          return;
        }

        const rows = data as PatientLite[];
        setPatients(rows);

        // Keep only the small recent/search result set for offline appointment entry.
        if (!query) await secureOfflineSave(cacheKey, rows);
      } catch {
        const cached = await secureOfflineGet<PatientLite[]>(cacheKey);
        if (cached) setPatients(cached);
      } finally {
        if (!cancelled) setPatientSearchLoading(false);
      }
    };

    timer = window.setTimeout(() => void searchPatients(), patientSearch.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [hydrating, cid, isOffline, patientSearch]);
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

  const startReschedule = (a: Appointment) => {
    setReschedulingId(a.id);
    setRescheduleForm({
      date: new Date(a.appointment_date + "T00:00:00"),
      time: a.appointment_time || "",
    });
  };

  const handleReschedule = async () => {
    if (!cid || !reschedulingId) return;
    if (!rescheduleForm.time?.trim()) {
      toast.error("Set the new appointment time");
      return;
    }
    const appointment = appointments.find(a => a.id === reschedulingId);
    if (!appointment) {
      toast.error("Appointment could not be found. Please refresh and try again.");
      return;
    }

    const newDate = format(rescheduleForm.date, "yyyy-MM-dd");
    const dateChanged = appointment.appointment_date !== newDate;
    const timeChanged = (appointment.appointment_time || "") !== rescheduleForm.time;
    const offline = isOffline || (typeof navigator !== "undefined" && !navigator.onLine);

    if (offline) {
      const payload = {
        ...appointment,
        id: appointment.id,
        clinic_id: cid,
        appointment_date: newDate,
        appointment_time: rescheduleForm.time,
        ...(dateChanged || timeChanged ? { reminder_sent_at: null, reminder_channel: null } : {}),
      };
      await enqueueOfflineOperation({ clinicId: cid, userId: null, kind: "appointment.save", entityId: appointment.id, payload });
      const next = appointments.map(a => a.id === appointment.id
        ? { ...a, appointment_date: newDate, appointment_time: rescheduleForm.time, reminder_sent_at: null, reminder_channel: null, offline_pending_sync: true }
        : a);
      cacheAppointmentsOffline(cid, next);
      setAppointments(next.filter(a => a.appointment_date >= filterDateStr));
      setReschedulingId(null);
      toast.success("Appointment rescheduled offline — it will sync automatically");
      return;
    }

    setRescheduling(true);
    const { error: uErr } = await apiClient.from("appointments").update({
      appointment_date: newDate,
      appointment_time: rescheduleForm.time,
      ...(dateChanged || timeChanged ? { reminder_sent_at: null, reminder_channel: null } : {}),
    } as any).eq("clinic_id", cid).eq("id", reschedulingId);
    setRescheduling(false);

    if (uErr) {
      diag.error("query", "appointment reschedule failed", uErr, { id: reschedulingId });
      toast.error(uErr.message);
      return;
    }

    toast.success(dateChanged || timeChanged ? "Appointment rescheduled. A new reminder is now due." : "Appointment schedule confirmed.");
    setReschedulingId(null);
    loadAppointments();
  };

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      today: appointments.filter(a => a.appointment_date === today && a.status !== "cancelled").length,
      pending: appointments.filter(a => a.status === "pending").length,
      confirmed: appointments.filter(a => a.status === "confirmed").length,
      reminders: reminders.filter((r: any) => r.status === "due" && !r.sent_at).length,
    };
  }, [appointments, reminders]);

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
      const appointmentId = editingId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "appointment-" + Date.now());
      const offlinePayload = { ...payload, id: appointmentId };
      await enqueueOfflineOperation({ clinicId: cid, userId: null, kind: "appointment.save", entityId: appointmentId, payload: offlinePayload });
      const current = await secureOfflineGet<any[]>(`appointments:${cid}`) ?? [];
      const local = { ...offlinePayload, patient_name: patients.find(p => p.id === payload.patient_id)?.full_name || "Unknown patient", offline_pending_sync: true };
      cacheAppointmentsOffline(cid, [local, ...current.filter(a => a.id !== appointmentId)]);
      toast.success("Saved offline — will sync automatically");
      setShowForm(false);
      setEditingId(null);
      setForm({ patientId: "", date: new Date(), time: "", reason: "" });
      setSaving(false);
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
    if (!cid) return;

    setRemindingId(appointment.id);
    try {
      let recipientName = appointment.patient_name || "there";
      let recipientPhone: string | null = null;

      if (appointment.patient_id) {
        const { data: patient, error } = await apiClient
          .from("patients").select("id, full_name, phone")
          .eq("clinic_id", cid).eq("id", appointment.patient_id).maybeSingle();

        if (error || !patient) {
          toast.error(error?.message || "Patient not found.");
          return;
        }
        recipientName = patient.full_name || recipientName;
        recipientPhone = patient.phone || null;
      } else if (appointment.outreach_lead_id || appointment.is_outreach) {
        let leadPhone = appointment.lead_phone || null;
        let leadName = appointment.patient_name || "Outreach lead";

        if (appointment.outreach_lead_id) {
          const { data: lead, error } = await apiClient
            .from("outreach_leads").select("id, full_name, phone")
            .eq("clinic_id", cid).eq("id", appointment.outreach_lead_id).maybeSingle();

          if (error || !lead) {
            toast.error(error?.message || "Outreach lead not found.");
            return;
          }
          leadName = lead.full_name || leadName;
          leadPhone = lead.phone || leadPhone;
        }

        recipientName = leadName;
        recipientPhone = leadPhone;
      } else {
        toast.error("This appointment has no patient or Outreach lead contact.");
        return;
      }

      const phone = normalizeWhatsAppNumber(recipientPhone);
      if (!phone) {
        toast.error("No valid WhatsApp/phone number is saved for this appointment.");
        return;
      }

      const dateLabel = new Date(appointment.appointment_date + "T00:00:00")
        .toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
      const timeLabel = appointment.appointment_time
        ? (() => {
            const [hours, minutes] = appointment.appointment_time.split(":").map(Number);
            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return appointment.appointment_time;
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          })()
        : null;
      const greetingName = recipientName && recipientName !== "Outreach lead" ? recipientName : null;
      const message = [
        "Cedar Eye Clinic",
        "",
        greetingName ? "Hello " + greetingName + "," : "Hello,",
        "",
        "This is a friendly reminder about your appointment at Cedar Eye Clinic on " +
          dateLabel + (timeLabel ? " at " + timeLabel : "") + ".",
        "",
        "We look forward to seeing you. Please arrive 10 minutes early.",
        "",
        "Clinic opening hours:",
        "Monday–Friday: 9:00 AM–5:00 PM",
        "Saturday: 10:00 AM–3:00 PM",
        "",
        "If you need to reschedule or have any questions, simply reply to this message or contact us on WhatsApp.",
        "",
        "Thank you,",
        "Cedar Eye Clinic",
      ].join("\n");

      window.open(whatsappLink(phone, message), "_blank", "noopener,noreferrer");

      const sentAt = new Date().toISOString();
      const candidate = reminders
        .filter((r: any) => r.appointment_id === appointment.id && !r.sent_at && (r.status === "due" || r.status === "pending"))
        .sort((a: any, b: any) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0];

      if (candidate) {
        const { error: reminderTrackError } = await apiClient
          .from("appointment_reminders")
          .update({
            status: "sent",
            sent_at: sentAt,
            sent_by: (await apiClient.auth.getUser()).data.user?.id || null,
            channel: "whatsapp_link",
            updated_at: sentAt,
          } as any)
          .eq("clinic_id", cid)
          .eq("id", candidate.id);
        if (reminderTrackError) console.warn("Failed to track reminder:", reminderTrackError);
      }

      const { error: trackError } = await apiClient
        .from("appointments")
        .update({ reminder_sent_at: sentAt, reminder_channel: "whatsapp" } as any)
        .eq("clinic_id", cid)
        .eq("id", appointment.id);
      if (trackError) console.warn("Failed to track appointment reminder:", trackError);

      toast.success("WhatsApp reminder opened. Press Send in WhatsApp to deliver it.");
      loadAppointments();
    } finally {
      setRemindingId(null);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!cid) return;
    const offline = isOffline || (typeof navigator !== "undefined" && !navigator.onLine);
    if (offline) {
      await enqueueOfflineOperation({ clinicId: cid, userId: null, kind: "appointment.status", entityId: id, payload: { status } });
      const current = await secureOfflineGet<any[]>(`appointments:${cid}`) ?? appointments;
      const next = current.map(a => a.id === id ? { ...a, status, offline_pending_sync: true } : a);
      cacheAppointmentsOffline(cid, next);
      setAppointments(next.filter(a => a.appointment_date >= filterDateStr));
      toast.success("Appointment status saved offline — it will sync automatically");
      return;
    }
    const { error: uErr } = await apiClient.from("appointments").update({ status } as any).eq("clinic_id", cid).eq("id", id);
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
                  <div className="p-2 sticky top-0 bg-popover z-10">
                    <Input
                      value={patientSearch}
                      onChange={e => setPatientSearch(e.target.value)}
                      placeholder="Search patient name..."
                      className="rounded-lg h-9"
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                  {patientSearchLoading ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching patients…</div>
                  ) : patients.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No patients found.</div>
                  ) : (
                    patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)
                  )}
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

      {reschedulingId && cid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl animate-fade-in">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <CalendarClock size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">Reschedule appointment</h2>
                    <p className="text-xs text-muted-foreground">Choose the new date and time.</p>
                  </div>
                </div>
                {(() => {
                  const appt = appointments.find(a => a.id === reschedulingId);
                  if (!appt) return null;
                  return (
                    <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2">
                      <p className="text-sm font-medium">{appt.patient_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Current: {format(new Date(appt.appointment_date + "T00:00:00"), "PPP")}
                        {appt.appointment_time ? " at " + appt.appointment_time : ""}
                      </p>
                    </div>
                  );
                })()}
              </div>
              <button type="button" onClick={() => setReschedulingId(null)} className="p-2 rounded-xl hover:bg-muted" title="Close reschedule dialog" aria-label="Close reschedule dialog">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">New date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal rounded-xl">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {format(rescheduleForm.date, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={rescheduleForm.date} onSelect={d => d && setRescheduleForm(f => ({ ...f, date: d }))} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">New time</Label>
                <Input type="time" className="rounded-xl" value={rescheduleForm.time} onChange={e => setRescheduleForm(f => ({ ...f, time: e.target.value }))} />
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">What happens when you reschedule?</p>
                <ul className="space-y-1 list-disc pl-4">
                  <li>The same appointment record is updated.</li>
                  <li>Patient, clinic, reason and appointment status are preserved.</li>
                  <li>If the date or time changes, the previous reminder is cleared and a new reminder becomes due.</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setReschedulingId(null)} disabled={rescheduling}>Keep current</Button>
                <Button type="button" className="rounded-xl gap-1.5" onClick={handleReschedule} disabled={rescheduling}>
                  <CalendarClock size={15} />{rescheduling ? "Rescheduling..." : "Confirm reschedule"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="medical-card appointment-stat appointment-stat-teal p-3"><p className="text-[10px] text-muted-foreground">Today</p><p className="text-xl font-bold mt-1">{stats.today}</p></div>
        <div className="medical-card appointment-stat appointment-stat-teal p-3"><p className="text-[10px] text-muted-foreground">Pending</p><p className="text-xl font-bold mt-1">{stats.pending}</p></div>
        <div className="medical-card appointment-stat appointment-stat-blue p-3"><p className="text-[10px] text-muted-foreground">Confirmed</p><p className="text-xl font-bold mt-1">{stats.confirmed}</p></div>
        <div className="medical-card appointment-stat appointment-stat-blue p-3"><p className="text-[10px] text-muted-foreground">Reminder due</p><p className="text-xl font-bold mt-1">{stats.reminders}</p></div>
      </div>

      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xs text-muted-foreground">Showing appointments from {format(filterDate, "PPP")} onward</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl">
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />{format(filterDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterDate} onSelect={d => d && setFilterDate(d)} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      {showHydrating ? (
        <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>
      ) : showNoClinic ? (
        <div className="form-section flex items-start gap-3 text-sm">
          <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
          <div><div className="font-medium">No active clinic</div><div className="text-muted-foreground">Select a clinic to view appointments.</div></div>
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
        <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No upcoming appointments.</div>
      ) : (
        <div className="space-y-2">
          {appointments.map(a => (
            <div key={a.id} className="medical-card appointment-item p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => a.patient_id ? (window.location.href = "/patient/" + a.patient_id) : undefined}>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0"><Clock size={17} className="text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{a.appointment_time ?? "—"}</span>
                    <span className="text-sm font-semibold truncate">{a.patient_name}</span>
                    {a.is_outreach && <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary">Outreach lead</span>}
                    <span className={`text-[10px] px-2 py-1 rounded-full capitalize ${statusStyle(a.status)}`}>{a.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{a.appointment_date}{a.reason ? " • " + a.reason : ""}{a.is_outreach && a.lead_phone ? " • " + a.lead_phone : ""}</p>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {(["24h", "2h"] as const).map((type) => {
                      const reminder = reminders.find((r: any) => r.appointment_id === a.id && r.reminder_type === type && r.scheduled_for?.startsWith(a.appointment_date));
                      if (!reminder) return null;
                      const label = type === "24h" ? "24h" : "2h";
                      if (reminder.status === "sent" || reminder.sent_at) return <span key={type} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-success/10 text-success"><Bell size={11} /> {label} sent</span>;
                      if (reminder.status === "due") return <span key={type} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700"><BellRing size={11} /> {label} due</span>;
                      return <span key={type} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground"><Clock size={11} /> {label} scheduled</span>;
                    })}
                    {a.source === "auto" && <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary">From visit</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {(a.status === "pending" || a.status === "confirmed") && <>
                    <button onClick={() => updateStatus(a.id, "completed")} className="p-2 rounded-xl hover:bg-muted" title="Mark appointment as completed"><CheckCircle2 size={16} className="text-success" /></button>
                    <button onClick={() => updateStatus(a.id, "cancelled")} className="p-2 rounded-xl hover:bg-muted" title="Cancel appointment"><XCircle size={16} className="text-destructive" /></button>
                  </>}
                  <button onClick={() => startReschedule(a)} className="p-2 rounded-xl hover:bg-muted" title="Reschedule appointment" aria-label={"Reschedule appointment for " + (a.patient_name || "patient")}><CalendarClock size={16} className="text-primary" /></button>
                  <button onClick={() => startEdit(a)} className="p-2 rounded-xl hover:bg-muted" title="Edit appointment" aria-label={"Edit appointment for " + (a.patient_name || "patient")}><Pencil size={16} /></button>
                  <button
                    onClick={() => sendReminder(a)}
                    disabled={remindingId === a.id || a.status === "cancelled" || a.status === "completed"}
                    className="p-2 rounded-xl hover:bg-muted disabled:opacity-50"
                    title={a.reminder_sent_at ? "Resend WhatsApp reminder" : "Send WhatsApp reminder"}
                    aria-label={a.reminder_sent_at ? "Resend WhatsApp appointment reminder" : "Send WhatsApp appointment reminder"}
                  >
                    {remindingId === a.id ? <Clock size={16} className="text-primary animate-spin" /> : <Bell size={16} className="text-primary" />}
                  </button>
                </div>
              </div>
              {a.patient_id && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <a href={"/patient/" + a.patient_id} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline" title="Open patient record" aria-label={"Open patient record for " + (a.patient_name || "patient")}>
                    <UserRound size={12} />Open record<ChevronRight size={12} />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
