import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Eye, Stethoscope, ClipboardList, History, Pencil, Gauge, Download, Phone, MessageCircle, CheckCircle2 } from "lucide-react";
import { generateVisitPdf } from "@/lib/visitPdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  readingAddUnaidedOu: "",
  // Aided VA
  vaAidedOd: "", vaAidedOs: "", vaAidedOu: "",
  vaAidedOdPh: "", vaAidedOsPh: "",
  readingAddAidedOu: "",
  // Auto refraction
  autoOdSphere: "", autoOdCyl: "", autoOdAxis: "",
  autoOsSphere: "", autoOsCyl: "", autoOsAxis: "",
  // Subjective refraction
  subOdSphere: "", subOdCyl: "", subOdAxis: "",
  subOsSphere: "", subOsCyl: "", subOsAxis: "",
  subReadingAdd: "", subVaOutcome: "",
  examination: "",
  iopOd: "", iopOs: "",
  diagnosis: "", treatment: "", notes: "",
});

export default function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  const patientId = id || "";
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
    if (!patientId) { setLoading(false); return; }
    (async () => {
      const [patRes, visRes, hmoRes] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patientId).maybeSingle(),
        supabase.from("visits").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
        supabase.from("hmos").select("id, name").eq("status", "active"),
      ]);
      if (patRes.data) setPatient(patRes.data as unknown as PatientData);
      if (visRes.data) setVisits(visRes.data);
      if (hmoRes.data) {
        setHmos(hmoRes.data as any);
        setHmoMap(new Map((hmoRes.data as any[]).map(h => [h.id, h.name])));
      }
      setLoading(false);
    })();
  }, [patientId]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSaveVisit = async (markCompleted: boolean) => {
    if (!patient) return;
    setSaving(true);
    const { data, error } = await supabase.from("visits").insert({
      patient_id: patient.id,
      payment_type: patient.payment_type,
      active_hmo_id: patient.active_hmo_id,
      chief_complaint: form.chiefComplaint || null,
      history: form.history || null,
      old_lens_prescription: form.oldLensPrescription || null,
      va_unaided_od: form.vaUnaidedOd || null, va_unaided_os: form.vaUnaidedOs || null,
      va_aided_od: form.vaAidedOd || null, va_aided_os: form.vaAidedOs || null,
      examination: form.examination || null,
      iop_od: form.iopOd ? Number(form.iopOd) : null,
      iop_os: form.iopOs ? Number(form.iopOs) : null,
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
    if (data) setVisits([data, ...visits]);
  };

  const handleEditPatient = async () => {
    if (!patient) return;
    const { error } = await supabase.from("patients").update({
      full_name: editForm.full_name,
      age: editForm.age,
      gender: editForm.gender,
      phone: editForm.phone,
      address: editForm.address,
      next_of_kin: editForm.next_of_kin,
      payment_type: editForm.payment_type,
      active_hmo_id: editForm.payment_type === "hmo" ? editForm.active_hmo_id : null,
      enrollee_number: editForm.enrollee_number || "",
    } as any).eq("id", patient.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient info updated");
    setPatient({ ...patient, ...editForm } as PatientData);
    setEditing(false);
  };

  if (loading) return <AppLayout><div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  if (!patient) return <AppLayout><p className="text-center py-12 text-muted-foreground">Patient not found.</p></AppLayout>;

  const isHmo = patient.payment_type === "hmo";
  const hmoName = patient.active_hmo_id ? hmoMap.get(patient.active_hmo_id) : null;

  return (
    <AppLayout>
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
                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-md">#{patient.queue_number}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium uppercase ${isHmo ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}>
                  {isHmo ? (hmoName || "HMO") : "Private"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {patient.gender}, {patient.age} yrs • {patient.phone}
              </p>
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
            <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity</h2>
            <div className="grid grid-cols-3 gap-3">
              <div />
              <Label className="text-xs text-center text-muted-foreground font-semibold">OD</Label>
              <Label className="text-xs text-center text-muted-foreground font-semibold">OS</Label>

              <Label className="text-xs flex items-center font-semibold">Unaided</Label>
              <Input className="rounded-xl text-center" value={form.vaUnaidedOd} onChange={e => set("vaUnaidedOd", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaUnaidedOs} onChange={e => set("vaUnaidedOs", e.target.value)} placeholder="6/6" />

              <Label className="text-xs flex items-center font-semibold">Aided</Label>
              <Input className="rounded-xl text-center" value={form.vaAidedOd} onChange={e => set("vaAidedOd", e.target.value)} placeholder="6/6" />
              <Input className="rounded-xl text-center" value={form.vaAidedOs} onChange={e => set("vaAidedOs", e.target.value)} placeholder="6/6" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="exam" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Gauge size={16} /> Examination</h2>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Examination findings</Label><Textarea className="rounded-xl" value={form.examination} onChange={e => set("examination", e.target.value)} rows={4} placeholder="External, anterior segment, posterior segment..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">IOP OD (mmHg)</Label><Input className="rounded-xl" type="number" value={form.iopOd} onChange={e => set("iopOd", e.target.value)} placeholder="16" /></div>
                <div className="space-y-1"><Label className="text-xs">IOP OS (mmHg)</Label><Input className="rounded-xl" type="number" value={form.iopOs} onChange={e => set("iopOs", e.target.value)} placeholder="16" /></div>
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <div><strong>VA UA OD:</strong> {v.va_unaided_od || "—"}</div>
                        <div><strong>VA UA OS:</strong> {v.va_unaided_os || "—"}</div>
                        <div><strong>VA Aided OD:</strong> {v.va_aided_od || "—"}</div>
                        <div><strong>VA Aided OS:</strong> {v.va_aided_os || "—"}</div>
                      </div>
                      {(v.iop_od || v.iop_os) && (
                        <div><strong>IOP:</strong> OD {v.iop_od ?? "—"} / OS {v.iop_os ?? "—"} mmHg</div>
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
    </AppLayout>
  );
}
