import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Eye, Stethoscope, ClipboardList, History, Pencil, Gauge, Download, Phone, MessageCircle, CheckCircle2 } from "lucide-react";
import { generateVisitPdf } from "@/lib/visitPdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess } from "@/hooks/useAccess";

interface PatientData {
  id: string;
  full_name: string;
  age: number | null;
  gender: string | null;
  phone: string;
  address: string;
  next_of_kin: string;
  payment_type: string;
  active_hmo_id: string | null;
  enrollee_number: string;
  queue_number: number;
  queue_status: string;
  priority: string;
  patient_number?: string | null;
}

const emptyVisitForm = () => ({
  chiefComplaint: "", history: "", oldLensPrescription: "",
  // Unaided VA
  vaUnaidedOd: "", vaUnaidedOs: "", vaUnaidedOu: "",
  vaUnaidedOdPh: "", vaUnaidedOsPh: "",
  vaUnaidedNearOu: "",
  // Aided VA
  vaAidedOd: "", vaAidedOs: "", vaAidedOu: "",
  vaAidedOdPh: "", vaAidedOsPh: "",
  vaAidedNearOu: "",
  // Auto refraction
  autoOdSphere: "", autoOdCyl: "", autoOdAxis: "", autoVaOd: "",
  autoOsSphere: "", autoOsCyl: "", autoOsAxis: "", autoVaOs: "",
  // Subjective refraction
  subOdSphere: "", subOdCyl: "", subOdAxis: "", subVaOd: "",
  subOsSphere: "", subOsCyl: "", subOsAxis: "", subVaOs: "",
  subReadingAdd: "", subVaOutcome: "",
  examination: "",
  iopOd: "", iopOs: "", iopTime: "",
  diagnosis: "", treatment: "", notes: "",
});

export default function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  const patientId = id || "";
  const { effectiveClinicId: cid } = useAccess();
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [hmos, setHmos] = useState<{ id: string; name: string }[]>([]);
  const [hmoMap, setHmoMap] = useState<Map<string, string>>(new Map());
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PatientData>>({});
  const [form, setForm] = useState(emptyVisitForm());

  useEffect(() => {
    if (!patientId || !cid) { setLoading(false); return; }
    (async () => {
      const [patRes, visRes, hmoRes, clinicRes] = await Promise.all([
  apiClient
    .from("patients")
    .select("*")
    .eq("clinic_id", cid)
    .eq("id", patientId)
    .maybeSingle(),

  apiClient
    .from("visits")
    .select("*")
    .eq("clinic_id", cid)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false }),

  apiClient
    .from("hmos")
    .select("id, name")
    .eq("clinic_id", cid)
    .eq("status", "active"),

  apiClient
    .from("clinics")
    .select("name")
    .eq("id", cid)
    .maybeSingle(),
]);
        apiClient
  .from("patients")
  .select("*")
  .eq("clinic_id", cid)
  .eq("id", patientId)
  .maybeSingle(),      
        apiClient.from("visits").select("*").eq("clinic_id", cid).eq("patient_id", patientId).order("created_at", { ascending: false }),
        apiClient.from("hmos").select("id, name").eq("clinic_id", cid).eq("status", "active"),
      ]);
      console.debug("[patient-record]", { clinic_id: cid, patient_id: patientId, visits: visRes.data?.length ?? 0 });
      if (patRes.data) {
  setPatient({
    ...patRes.data,
    clinic_name: clinicRes.data?.name || "",
  } as any);
      }
      if (visRes.data) setVisits(visRes.data);
      if (hmoRes.data) {
        setHmos(hmoRes.data as any);
        setHmoMap(new Map((hmoRes.data as any[]).map(h => [h.id, h.name])));
      }
      setLoading(false);
    })();
  }, [patientId, cid]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSaveVisit = async (markCompleted: boolean) => {
    if (!patient) return;
    if (!cid) { toast.error("No active clinic"); return; }
    setSaving(true);
    const { data, error } = await apiClient.from("visits").insert({
      clinic_id: cid,
      patient_id: patient.id,
      payment_type: patient.payment_type,
      active_hmo_id: patient.active_hmo_id,
      chief_complaint: form.chiefComplaint || null,
      history: form.history || null,
      old_lens_prescription: form.oldLensPrescription || null,
      va_unaided_od: form.vaUnaidedOd || null, va_unaided_os: form.vaUnaidedOs || null, va_unaided_ou: form.vaUnaidedOu || null,
      va_unaided_od_ph: form.vaUnaidedOdPh || null, va_unaided_os_ph: form.vaUnaidedOsPh || null,
      va_unaided_near_ou: form.vaUnaidedNearOu || null,
      va_aided_od: form.vaAidedOd || null, va_aided_os: form.vaAidedOs || null, va_aided_ou: form.vaAidedOu || null,
      va_aided_od_ph: form.vaAidedOdPh || null, va_aided_os_ph: form.vaAidedOsPh || null,
      va_aided_near_ou: form.vaAidedNearOu || null,
      auto_od_sphere: form.autoOdSphere || null, auto_od_cyl: form.autoOdCyl || null, auto_od_axis: form.autoOdAxis || null, auto_va_od: form.autoVaOd || null,
      auto_os_sphere: form.autoOsSphere || null, auto_os_cyl: form.autoOsCyl || null, auto_os_axis: form.autoOsAxis || null, auto_va_os: form.autoVaOs || null,
      sub_od_sphere: form.subOdSphere || null, sub_od_cyl: form.subOdCyl || null, sub_od_axis: form.subOdAxis || null, sub_va_od: form.subVaOd || null,
      sub_os_sphere: form.subOsSphere || null, sub_os_cyl: form.subOsCyl || null, sub_os_axis: form.subOsAxis || null, sub_va_os: form.subVaOs || null,
      sub_reading_add: form.subReadingAdd || null, sub_va_outcome: form.subVaOutcome || null,
      examination: form.examination || null,
      iop_od: form.iopOd ? Number(form.iopOd) : null,
      iop_os: form.iopOs ? Number(form.iopOs) : null,
      iop_time: form.iopTime || null,
      diagnosis: form.diagnosis || null,
      treatment: form.treatment || null,
      notes: form.notes || null,
      status: markCompleted ? "completed" : "open",
      completed_at: markCompleted ? new Date().toISOString() : null,
    } as any).select().single();
    setSaving(false);
    if (error) { toast.error("Failed to save visit: " + error.message); return; }
    toast.success(markCompleted ? "Visit completed — bill auto-created" : "Visit saved");
    setForm(emptyVisitForm());
    // Re-sync visit history from DB so Past tab always reflects server state
    const { data: fresh } = await apiClient
      .from("visits").select("*").eq("clinic_id", cid).eq("patient_id", patient.id)
      .order("created_at", { ascending: false });
    if (fresh) setVisits(fresh);
    else if (data) setVisits([data, ...visits]);
  };

  const handleEditPatient = async () => {
    if (!patient) return;
    if (!cid) { toast.error("No active clinic"); return; }
    const { error } = await apiClient.from("patients").update({
      full_name: editForm.full_name,
      age: editForm.age,
      gender: editForm.gender,
      phone: editForm.phone,
      address: editForm.address,
      next_of_kin: editForm.next_of_kin,
      payment_type: editForm.payment_type,
      active_hmo_id: editForm.payment_type === "hmo" ? editForm.active_hmo_id : null,
      enrollee_number: editForm.enrollee_number || "",
    } as any).eq("clinic_id", cid).eq("id", patient.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient info updated");
    setPatient({ ...patient, ...editForm } as PatientData);
    setEditing(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!patient) return <p className="text-center py-12 text-muted-foreground">Patient not found.</p>;

  const isHmo = patient.payment_type === "hmo";
  const hmoName = patient.active_hmo_id ? hmoMap.get(patient.active_hmo_id) : null;

  return (
    <>
      <Link to="/patients" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={12} /> Back
      </Link>

      <div className="medical-card mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary">{(patient.full_name || "?")[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold">{patient.full_name}</h1>
                {patient.patient_number && <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-md">{patient.patient_number}</span>}
                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-md">#{patient.queue_number}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium uppercase ${isHmo ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}>
                  {isHmo ? (hmoName || "HMO") : "Private"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
  {patient.gender}, {patient.age} yrs • {patient.phone}
</p>

{isHmo && patient.enrollee_number && (
  <p className="text-xs text-accent font-medium mt-1">
    Enrollee No: {patient.enrollee_number}
  </p>
)}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {patient.phone && (
              <>
                <a href={`tel:${patient.phone}`} className="p-2 rounded-xl hover:bg-muted transition-colors"><Phone size={14} className="text-success" /></a>
                <a href={`https://wa.me/${patient.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl hover:bg-muted transition-colors"><MessageCircle size={14} className="text-success" /></a>
              </>
            )}
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setEditing(true); setEditForm(patient); }}>
              <Pencil size={12} />
            </Button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="form-section mb-5 border-2 border-primary/20">
          <h2 className="section-title text-sm mb-3">Edit Patient</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Name</Label><Input className="rounded-xl" value={editForm.full_name || ""} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Age</Label><Input className="rounded-xl" type="number" value={editForm.age ?? ""} onChange={e => setEditForm(f => ({ ...f, age: parseInt(e.target.value) || null }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Gender</Label>
                <Select value={editForm.gender || ""} onValueChange={v => setEditForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Phone</Label><Input className="rounded-xl" value={editForm.phone || ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Next of Kin</Label><Input className="rounded-xl" value={editForm.next_of_kin || ""} onChange={e => setEditForm(f => ({ ...f, next_of_kin: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Payment Type</Label>
              <Select value={editForm.payment_type || "private"} onValueChange={v => setEditForm(f => ({ ...f, payment_type: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="hmo">HMO</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Changes are tracked in HMO history.</p>
            </div>
            {editForm.payment_type === "hmo" && (
              <div className="space-y-1"><Label className="text-xs">HMO Provider</Label>
                <Select value={editForm.active_hmo_id || ""} onValueChange={v => setEditForm(f => ({ ...f, active_hmo_id: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select HMO" /></SelectTrigger>
                  <SelectContent>{hmos.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" className="rounded-xl" onClick={handleEditPatient}>Save</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList className="w-full flex overflow-x-auto bg-muted/50 rounded-2xl p-1">
          <TabsTrigger value="history" className="flex items-center gap-1 text-[11px] rounded-xl"><ClipboardList size={12} /> History</TabsTrigger>
          <TabsTrigger value="va" className="flex items-center gap-1 text-[11px] rounded-xl"><Eye size={12} /> VA</TabsTrigger>
          <TabsTrigger value="refraction" className="flex items-center gap-1 text-[11px] rounded-xl"><Eye size={12} /> Refraction</TabsTrigger>
          <TabsTrigger value="exam" className="flex items-center gap-1 text-[11px] rounded-xl"><Gauge size={12} /> Exam</TabsTrigger>
          <TabsTrigger value="dx" className="flex items-center gap-1 text-[11px] rounded-xl"><Stethoscope size={12} /> Dx & Tx</TabsTrigger>
          <TabsTrigger value="visits" className="flex items-center gap-1 text-[11px] rounded-xl"><History size={12} /> Past</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><ClipboardList size={16} /> Case History</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Chief Complaint</Label><Textarea className="rounded-xl" value={form.chiefComplaint} onChange={e => set("chiefComplaint", e.target.value)} rows={2} /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">History (ocular, medical, family)</Label><Textarea className="rounded-xl" value={form.history} onChange={e => set("history", e.target.value)} rows={3} /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Old Lens Prescription</Label><Textarea className="rounded-xl" value={form.oldLensPrescription} onChange={e => set("oldLensPrescription", e.target.value)} rows={2} placeholder="e.g. OD -2.00/-0.50x180  OS -1.75/-0.75x10" /></div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="va" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity — Unaided</h2>
            <div className="grid grid-cols-4 gap-2">
              <div />
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">OD</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">OS</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">OU</Label>

              <Label className="text-xs flex items-center font-semibold">Distance</Label>
              <Input className="rounded-xl text-center" value={form.vaUnaidedOd} onChange={e => set("vaUnaidedOd", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaUnaidedOs} onChange={e => set("vaUnaidedOs", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaUnaidedOu} onChange={e => set("vaUnaidedOu", e.target.value)} placeholder="6/6" />

              <Label className="text-xs flex items-center font-semibold">Pinhole</Label>
              <Input className="rounded-xl text-center" value={form.vaUnaidedOdPh} onChange={e => set("vaUnaidedOdPh", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaUnaidedOsPh} onChange={e => set("vaUnaidedOsPh", e.target.value)} placeholder="6/6" />
              <div />

              <Label className="text-xs flex items-center font-semibold">Near VA (OU)</Label>
              <Input className="rounded-xl text-center col-span-3" value={form.vaUnaidedNearOu} onChange={e => set("vaUnaidedNearOu", e.target.value)} placeholder="N6" />
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity — Aided</h2>
            <div className="grid grid-cols-4 gap-2">
              <div />
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">OD</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">OS</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">OU</Label>

              <Label className="text-xs flex items-center font-semibold">Distance</Label>
              <Input className="rounded-xl text-center" value={form.vaAidedOd} onChange={e => set("vaAidedOd", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaAidedOs} onChange={e => set("vaAidedOs", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaAidedOu} onChange={e => set("vaAidedOu", e.target.value)} placeholder="6/6" />

              <Label className="text-xs flex items-center font-semibold">Pinhole</Label>
              <Input className="rounded-xl text-center" value={form.vaAidedOdPh} onChange={e => set("vaAidedOdPh", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaAidedOsPh} onChange={e => set("vaAidedOsPh", e.target.value)} placeholder="6/6" />
              <div />

              <Label className="text-xs flex items-center font-semibold">Near VA (OU)</Label>
              <Input className="rounded-xl text-center col-span-3" value={form.vaAidedNearOu} onChange={e => set("vaAidedNearOu", e.target.value)} placeholder="N6" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="refraction" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Eye size={16} /> Auto Refraction</h2>
            <div className="grid grid-cols-5 gap-2">
              <div />
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">Sphere</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">Cyl</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">Axis</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">VA</Label>

              <Label className="text-xs flex items-center font-semibold">OD</Label>
              <Input className="rounded-xl text-center" value={form.autoOdSphere} onChange={e => set("autoOdSphere", e.target.value)} placeholder="-1.00" />
              <Input className="rounded-xl text-center" value={form.autoOdCyl} onChange={e => set("autoOdCyl", e.target.value)} placeholder="-0.50" />
              <Input className="rounded-xl text-center" value={form.autoOdAxis} onChange={e => set("autoOdAxis", e.target.value)} placeholder="180" />
              <Input className="rounded-xl text-center" value={form.autoVaOd} onChange={e => set("autoVaOd", e.target.value)} placeholder="6/6" />

              <Label className="text-xs flex items-center font-semibold">OS</Label>
              <Input className="rounded-xl text-center" value={form.autoOsSphere} onChange={e => set("autoOsSphere", e.target.value)} placeholder="-1.00" />
              <Input className="rounded-xl text-center" value={form.autoOsCyl} onChange={e => set("autoOsCyl", e.target.value)} placeholder="-0.50" />
              <Input className="rounded-xl text-center" value={form.autoOsAxis} onChange={e => set("autoOsAxis", e.target.value)} placeholder="180" />
              <Input className="rounded-xl text-center" value={form.autoVaOs} onChange={e => set("autoVaOs", e.target.value)} placeholder="6/6" />
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title text-sm"><Eye size={16} /> Subjective Refraction</h2>
            <div className="grid grid-cols-5 gap-2">
              <div />
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">Sphere</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">Cyl</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">Axis</Label>
              <Label className="text-[10px] text-center text-muted-foreground font-semibold">VA</Label>

              <Label className="text-xs flex items-center font-semibold">OD</Label>
              <Input className="rounded-xl text-center" value={form.subOdSphere} onChange={e => set("subOdSphere", e.target.value)} placeholder="-1.00" />
              <Input className="rounded-xl text-center" value={form.subOdCyl} onChange={e => set("subOdCyl", e.target.value)} placeholder="-0.50" />
              <Input className="rounded-xl text-center" value={form.subOdAxis} onChange={e => set("subOdAxis", e.target.value)} placeholder="180" />
              <Input className="rounded-xl text-center" value={form.subVaOd} onChange={e => set("subVaOd", e.target.value)} placeholder="6/6" />

              <Label className="text-xs flex items-center font-semibold">OS</Label>
              <Input className="rounded-xl text-center" value={form.subOsSphere} onChange={e => set("subOsSphere", e.target.value)} placeholder="-1.00" />
              <Input className="rounded-xl text-center" value={form.subOsCyl} onChange={e => set("subOsCyl", e.target.value)} placeholder="-0.50" />
              <Input className="rounded-xl text-center" value={form.subOsAxis} onChange={e => set("subOsAxis", e.target.value)} placeholder="180" />
              <Input className="rounded-xl text-center" value={form.subVaOs} onChange={e => set("subVaOs", e.target.value)} placeholder="6/6" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-1"><Label className="text-xs">Reading ADD</Label><Input className="rounded-xl" value={form.subReadingAdd} onChange={e => set("subReadingAdd", e.target.value)} placeholder="+1.50" /></div>
              <div className="space-y-1"><Label className="text-xs">VA Outcome</Label><Input className="rounded-xl" value={form.subVaOutcome} onChange={e => set("subVaOutcome", e.target.value)} placeholder="6/6" /></div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="exam" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Gauge size={16} /> Examination</h2>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Examination findings</Label><Textarea className="rounded-xl" value={form.examination} onChange={e => set("examination", e.target.value)} rows={4} placeholder="External, anterior segment, posterior segment..." /></div>
              <div className="space-y-3">
                <div className="space-y-1 max-w-xs">
                  <Label className="text-xs">IOP — Time</Label>
                  <Input className="rounded-xl" type="time" value={form.iopTime} onChange={e => set("iopTime", e.target.value)} aria-label="IOP time (shared)" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Right Eye (OD)</Label>
                    <Input
                      className="rounded-xl"
                      type="number"
                      inputMode="decimal"
                      value={form.iopOd}
                      onChange={e => {
                        const v = e.target.value;
                        setForm(f => ({
                          ...f,
                          iopOd: v,
                          iopTime: v && !f.iopTime ? new Date().toTimeString().slice(0, 5) : f.iopTime,
                        }));
                      }}
                      placeholder="18 mmHg"
                      aria-label="IOP OD mmHg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Left Eye (OS)</Label>
                    <Input
                      className="rounded-xl"
                      type="number"
                      inputMode="decimal"
                      value={form.iopOs}
                      onChange={e => {
                        const v = e.target.value;
                        setForm(f => ({
                          ...f,
                          iopOs: v,
                          iopTime: v && !f.iopTime ? new Date().toTimeString().slice(0, 5) : f.iopTime,
                        }));
                      }}
                      placeholder="16 mmHg"
                      aria-label="IOP OS mmHg"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dx" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Stethoscope size={16} /> Diagnosis & Treatment</h2>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Diagnosis</Label><Textarea className="rounded-xl" value={form.diagnosis} onChange={e => set("diagnosis", e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label className="text-xs">Treatment Plan</Label><Textarea className="rounded-xl" value={form.treatment} onChange={e => set("treatment", e.target.value)} rows={3} /></div>
              <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea className="rounded-xl" value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="visits">
          <div className="medical-card">
            <h2 className="section-title text-sm mb-4"><History size={16} /> Visit History</h2>
            {visits.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No previous visits recorded.</p>
            ) : (
              <div className="space-y-2">
                {visits.map((v: any) => (
                  <details key={v.id} className="border border-border/60 rounded-xl overflow-hidden">
                    <summary className="px-4 py-3 cursor-pointer hover:bg-muted/50 text-sm flex items-center justify-between">
                      <span className="font-medium">
                        {new Date(v.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                        {v.diagnosis && <span className="text-muted-foreground ml-2 font-normal">— {String(v.diagnosis).slice(0, 50)}</span>}
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md ${v.status === "completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{v.status}</span>
                      </span>
                      <Button variant="ghost" size="sm" className="rounded-xl" onClick={(e) => { e.preventDefault(); generateVisitPdf(patient, v); }}>
                        <Download size={12} className="mr-1" /> Export
                      </Button>
                    </summary>
                    <div className="px-4 pb-4 text-xs space-y-2 border-t border-border/60 pt-3">
                      {v.chief_complaint && <div><strong>CC:</strong> {v.chief_complaint}</div>}
                      {v.history && (
  <div>
    <strong>History:</strong>
    <div className="whitespace-pre-line mt-1">
      {v.history}
    </div>
  </div>
)}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
  <div>
    <strong>VA UA OD:</strong>{" "}
    {v.va_unaided_od || "—"}
    {v.va_unaided_od_ph ? ` (PH: ${v.va_unaided_od_ph})` : ""}
  </div>

  <div>
    <strong>VA UA OS:</strong>{" "}
    {v.va_unaided_os || "—"}
    {v.va_unaided_os_ph ? ` (PH: ${v.va_unaided_os_ph})` : ""}
  </div>

  <div>
    <strong>VA Aided OD:</strong>{" "}
    {v.va_aided_od || "—"}
    {v.va_aided_od_ph ? ` (PH: ${v.va_aided_od_ph})` : ""}
  </div>

  <div>
    <strong>VA Aided OS:</strong>{" "}
    {v.va_aided_os || "—"}
    {v.va_aided_os_ph ? ` (PH: ${v.va_aided_os_ph})` : ""}
  </div>
</div>
                    
                      {(v.iop_od || v.iop_os) && (
                        <div>
                          <strong>IOP:</strong>{" "}
                          OD {v.iop_od ?? "—"} / OS {v.iop_os ?? "—"} mmHg
                          {v.iop_time ? ` @ ${String(v.iop_time).slice(0,5)}` : ""}
                        </div>
                      )}
                      {v.examination && <div><strong>Exam:</strong> {v.examination}</div>}
                      {v.diagnosis && <div><strong>Diagnosis:</strong> {v.diagnosis}</div>}
                      {v.treatment && <div><strong>Tx:</strong> {v.treatment}</div>}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-20 lg:bottom-4 mt-6 flex justify-end gap-2">
        <Button onClick={() => handleSaveVisit(false)} variant="outline" size="lg" className="rounded-2xl" disabled={saving}>
          {saving ? "..." : "Save Draft"}
        </Button>
        <Button onClick={() => handleSaveVisit(true)} size="lg" className="shadow-lg rounded-2xl px-6" disabled={saving}>
          <CheckCircle2 size={16} className="mr-1" /> Complete Visit
        </Button>
      </div>
    </>
  );
}
