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
import { ArrowLeft, Eye, FileText, Stethoscope, ClipboardList, History, Pencil, Gauge, Download, Phone, MessageCircle } from "lucide-react";
import { generateVisitPdf } from "@/lib/visitPdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const emptyForm = () => ({
  vaOdDistance: "", vaOsDistance: "", vaOuDistance: "",
  vaOdNear: "", vaOsNear: "", vaOuNear: "",
  pinholeOd: "", pinholeOs: "",
  autoOdSphere: "", autoOdCylinder: "", autoOdAxis: "",
  autoOsSphere: "", autoOsCylinder: "", autoOsAxis: "",
  autoVaOd: "", autoVaOs: "",
  subOdSphere: "", subOdCylinder: "", subOdAxis: "",
  subOsSphere: "", subOsCylinder: "", subOsAxis: "",
  subVaOd: "", subVaOs: "",
  readingAddOd: "", readingAddOs: "",
  readingAddVaOd: "", readingAddVaOs: "",
  finalPrescription: "",
  chiefComplaint: "", duration: "", ocularHistory: "", medicalHistory: "",
  extLids: "", extConjunctiva: "", extCornea: "",
  intCdrOd: "", intCdrOs: "", intFundusBg: "",
  tonometryOd: "", tonometryOs: "", tonometryTime: "", tonometryAmpm: "AM",
  diagnosis: "", drugsGiven: "", glassesPrescribed: "",
});

function RefractionGrid({ label, prefix, form, set, showVa }: {
  label: string; prefix: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  showVa?: boolean;
}) {
  const vaKey = prefix === "auto" ? "autoVa" : "subVa";
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className={`grid gap-2 ${showVa ? "grid-cols-5" : "grid-cols-4"}`}>
        <div />
        <Label className="text-[10px] text-center text-muted-foreground">SPH</Label>
        <Label className="text-[10px] text-center text-muted-foreground">CYL</Label>
        <Label className="text-[10px] text-center text-muted-foreground">AXIS</Label>
        {showVa && <Label className="text-[10px] text-center text-muted-foreground">VA</Label>}
        {["Od", "Os"].map(eye => (
          <div key={eye} className="contents">
            <Label className="text-xs flex items-center font-semibold">{eye === "Od" ? "OD" : "OS"}</Label>
            {["Sphere", "Cylinder", "Axis"].map(field => (
              <Input key={`${prefix}${eye}${field}`} className="text-center text-xs h-9 rounded-xl" value={form[`${prefix}${eye}${field}`] || ""} onChange={e => set(`${prefix}${eye}${field}`, e.target.value)} maxLength={20} />
            ))}
            {showVa && <Input className="text-center text-xs h-9 rounded-xl" value={form[`${vaKey}${eye}`] || ""} onChange={e => set(`${vaKey}${eye}`, e.target.value)} maxLength={20} />}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PatientData {
  id: number; full_name: string; age: number | null; gender: string | null;
  phone: string; address: string; insurance_name: string; enrollee_number: string;
  patient_type: string; hmo_provider: string; patient_uid: string; next_of_kin: string;
}

export default function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  const patientId = id ? parseInt(id, 10) : NaN;
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PatientData>>({});
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  useEffect(() => {
    if (isNaN(patientId)) { setLoading(false); return; }
    async function load() {
      const [patRes, visRes] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patientId).maybeSingle(),
        supabase.from("visits").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
      ]);
      if (patRes.data) setPatient(patRes.data as unknown as PatientData);
      if (visRes.data) setVisits(visRes.data);
      setLoading(false);
    }
    load();
  }, [patientId]);

  if (isNaN(patientId)) return <AppLayout><p className="text-center py-12 text-muted-foreground">Invalid patient ID.</p></AppLayout>;

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("visits").insert({
      patient_id: patientId,
      va_od_distance: form.vaOdDistance || null, va_os_distance: form.vaOsDistance || null, va_ou_distance: form.vaOuDistance || null,
      va_od_near: form.vaOdNear || null, va_os_near: form.vaOsNear || null, va_ou_near: form.vaOuNear || null,
      pinhole_od: form.pinholeOd || null, pinhole_os: form.pinholeOs || null,
      auto_od_sphere: form.autoOdSphere || null, auto_od_cylinder: form.autoOdCylinder || null, auto_od_axis: form.autoOdAxis || null,
      auto_os_sphere: form.autoOsSphere || null, auto_os_cylinder: form.autoOsCylinder || null, auto_os_axis: form.autoOsAxis || null,
      auto_va_od: form.autoVaOd || null, auto_va_os: form.autoVaOs || null,
      sub_od_sphere: form.subOdSphere || null, sub_od_cylinder: form.subOdCylinder || null, sub_od_axis: form.subOdAxis || null,
      sub_os_sphere: form.subOsSphere || null, sub_os_cylinder: form.subOsCylinder || null, sub_os_axis: form.subOsAxis || null,
      sub_va_od: form.subVaOd || null, sub_va_os: form.subVaOs || null,
      reading_add_od: form.readingAddOd || null, reading_add_os: form.readingAddOs || null,
      reading_add_va_od: form.readingAddVaOd || null, reading_add_va_os: form.readingAddVaOs || null,
      final_prescription: form.finalPrescription || null,
      chief_complaint: form.chiefComplaint || null, duration: form.duration || null,
      ocular_history: form.ocularHistory || null, medical_history: form.medicalHistory || null,
      ext_lids: form.extLids || null, ext_conjunctiva: form.extConjunctiva || null, ext_cornea: form.extCornea || null,
      int_cdr_od: form.intCdrOd || null, int_cdr_os: form.intCdrOs || null, int_fundus_bg: form.intFundusBg || null,
      tonometry_od: form.tonometryOd || null, tonometry_os: form.tonometryOs || null,
      tonometry_time: form.tonometryTime || null, tonometry_ampm: form.tonometryAmpm || null,
      diagnosis: form.diagnosis || null, drugs_given: form.drugsGiven || null, glasses_prescribed: form.glassesPrescribed || null,
    } as any);

    setSaving(false);
    if (error) { toast.error("Failed to save visit: " + error.message); return; }
    toast.success("Visit saved successfully");
    setForm(emptyForm());
    const { data } = await supabase.from("visits").select("*").eq("patient_id", patientId).order("created_at", { ascending: false });
    if (data) setVisits(data);
  };

  const handleEditPatient = async () => {
    const { error } = await supabase.from("patients").update({
      full_name: editForm.full_name, age: editForm.age, gender: editForm.gender,
      phone: editForm.phone, address: editForm.address, next_of_kin: editForm.next_of_kin,
      patient_type: editForm.patient_type, hmo_provider: editForm.hmo_provider,
      insurance_name: editForm.patient_type === "HMO" ? editForm.hmo_provider : "",
      enrollee_number: editForm.enrollee_number,
    }).eq("id", patientId);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient info updated");
    setPatient({ ...patient!, ...editForm } as PatientData);
    setEditing(false);
  };

  if (loading) return <AppLayout><div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  if (!patient) return <AppLayout><p className="text-center py-12 text-muted-foreground">Patient not found.</p></AppLayout>;

  return (
    <AppLayout>
      <Link to="/patients" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={12} /> Back
      </Link>

      {/* Patient Header Card */}
      <div className="medical-card mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary">{(patient.full_name || "?")[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold">{patient.full_name}</h1>
                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-md">{patient.patient_uid}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${patient.patient_type === "HMO" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}>
                  {patient.patient_type}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {patient.gender}, {patient.age} yrs • {patient.phone}
                {patient.patient_type === "HMO" && patient.hmo_provider && ` • ${patient.hmo_provider}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {patient.phone && (
              <>
                <a href={`tel:${patient.phone}`} className="p-2 rounded-xl hover:bg-muted transition-colors"><Phone size={14} className="text-success" /></a>
                <a href={`https://wa.me/${patient.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl hover:bg-muted transition-colors"><MessageCircle size={14} className="text-success" /></a>
              </>
            )}
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setEditing(true); setEditForm(patient); }}>
              <Pencil size={12} />
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Patient */}
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
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" className="rounded-xl" onClick={handleEditPatient}>Save</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="exam" className="space-y-4">
        <TabsList className="w-full flex overflow-x-auto bg-muted/50 rounded-2xl p-1">
          <TabsTrigger value="exam" className="flex items-center gap-1 text-[11px] rounded-xl"><Eye size={12} /> VA</TabsTrigger>
          <TabsTrigger value="examination" className="flex items-center gap-1 text-[11px] rounded-xl"><Gauge size={12} /> Exam</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1 text-[11px] rounded-xl"><ClipboardList size={12} /> History</TabsTrigger>
          <TabsTrigger value="diagnosis" className="flex items-center gap-1 text-[11px] rounded-xl"><Stethoscope size={12} /> Dx</TabsTrigger>
          <TabsTrigger value="visits" className="flex items-center gap-1 text-[11px] rounded-xl"><History size={12} /> Visits</TabsTrigger>
        </TabsList>

        {/* VA & Refraction */}
        <TabsContent value="exam" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity</h2>
            <div className="grid grid-cols-5 gap-2">
              <div />
              <Label className="text-[10px] text-center text-muted-foreground">Distance</Label>
              <Label className="text-[10px] text-center text-muted-foreground">Near</Label>
              <Label className="text-[10px] text-center text-muted-foreground">Pinhole</Label>
              <div />
              {[{ key: "Od", label: "OD" }, { key: "Os", label: "OS" }, { key: "Ou", label: "OU" }].map(eye => (
                <div key={eye.key} className="contents">
                  <Label className="text-xs flex items-center font-semibold">{eye.label}</Label>
                  <Input className="text-center text-xs h-9 rounded-xl" value={form[`va${eye.key}Distance`] || ""} onChange={e => set(`va${eye.key}Distance`, e.target.value)} />
                  <Input className="text-center text-xs h-9 rounded-xl" value={form[`va${eye.key}Near`] || ""} onChange={e => set(`va${eye.key}Near`, e.target.value)} />
                  {eye.key !== "Ou" ? <Input className="text-center text-xs h-9 rounded-xl" value={form[`pinhole${eye.key}`] || ""} onChange={e => set(`pinhole${eye.key}`, e.target.value)} /> : <div />}
                  <div />
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title text-sm"><FileText size={16} /> Refraction</h2>
            <RefractionGrid label="Auto Refraction" prefix="auto" form={form} set={set} showVa />
            <div className="border-t border-border/60 pt-4">
              <RefractionGrid label="Subjective Refraction" prefix="sub" form={form} set={set} showVa />
            </div>
            <div className="border-t border-border/60 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reading Add</p>
              <div className="grid grid-cols-3 gap-2">
                <div />
                <Label className="text-[10px] text-center text-muted-foreground">Add</Label>
                <Label className="text-[10px] text-center text-muted-foreground">VA</Label>
                {["Od", "Os"].map(eye => (
                  <div key={eye} className="contents">
                    <Label className="text-xs flex items-center font-semibold">{eye === "Od" ? "OD" : "OS"}</Label>
                    <Input className="text-center text-xs h-9 rounded-xl" value={form[`readingAdd${eye}`] || ""} onChange={e => set(`readingAdd${eye}`, e.target.value)} />
                    <Input className="text-center text-xs h-9 rounded-xl" value={form[`readingAddVa${eye}`] || ""} onChange={e => set(`readingAddVa${eye}`, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title text-sm">Final Prescription</h2>
            <Textarea className="rounded-xl" value={form.finalPrescription || ""} onChange={e => set("finalPrescription", e.target.value)} rows={3} placeholder="Enter final prescription..." />
          </div>
        </TabsContent>

        {/* Examination - Fundoscopy OD/OS fields removed */}
        <TabsContent value="examination" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm">External Examination</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Lids</Label><Textarea className="rounded-xl" value={form.extLids} onChange={e => set("extLids", e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label className="text-xs">Conjunctiva</Label><Textarea className="rounded-xl" value={form.extConjunctiva} onChange={e => set("extConjunctiva", e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label className="text-xs">Cornea</Label><Textarea className="rounded-xl" value={form.extCornea} onChange={e => set("extCornea", e.target.value)} rows={2} /></div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title text-sm">Internal Examination</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">CDR OD</Label><Input className="rounded-xl" value={form.intCdrOd} onChange={e => set("intCdrOd", e.target.value)} placeholder="e.g. 0.3" /></div>
              <div className="space-y-1"><Label className="text-xs">CDR OS</Label><Input className="rounded-xl" value={form.intCdrOs} onChange={e => set("intCdrOs", e.target.value)} placeholder="e.g. 0.3" /></div>
              <div className="space-y-1 col-span-2 sm:col-span-1"><Label className="text-xs">Fundus Background</Label><Textarea className="rounded-xl" value={form.intFundusBg} onChange={e => set("intFundusBg", e.target.value)} rows={2} /></div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title text-sm"><Gauge size={16} /> Tonometry</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1"><Label className="text-xs">IOP OD (mmHg)</Label><Input className="rounded-xl" value={form.tonometryOd} onChange={e => set("tonometryOd", e.target.value)} placeholder="16" /></div>
              <div className="space-y-1"><Label className="text-xs">IOP OS (mmHg)</Label><Input className="rounded-xl" value={form.tonometryOs} onChange={e => set("tonometryOs", e.target.value)} placeholder="16" /></div>
              <div className="space-y-1"><Label className="text-xs">Time</Label><Input className="rounded-xl" value={form.tonometryTime} onChange={e => set("tonometryTime", e.target.value)} placeholder="10:30" /></div>
              <div className="space-y-1"><Label className="text-xs">AM/PM</Label>
                <Select value={form.tonometryAmpm} onValueChange={v => set("tonometryAmpm", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Case History */}
        <TabsContent value="history" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><ClipboardList size={16} /> Case History</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Chief Complaint</Label><Textarea className="rounded-xl" value={form.chiefComplaint} onChange={e => set("chiefComplaint", e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label className="text-xs">Duration</Label><Input className="rounded-xl" value={form.duration} onChange={e => set("duration", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Ocular History</Label><Textarea className="rounded-xl" value={form.ocularHistory} onChange={e => set("ocularHistory", e.target.value)} rows={3} /></div>
              <div className="space-y-1"><Label className="text-xs">Medical History</Label><Textarea className="rounded-xl" value={form.medicalHistory} onChange={e => set("medicalHistory", e.target.value)} rows={3} /></div>
            </div>
          </div>
        </TabsContent>

        {/* Diagnosis */}
        <TabsContent value="diagnosis" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Stethoscope size={16} /> Diagnosis & Treatment</h2>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Diagnosis</Label><Textarea className="rounded-xl" value={form.diagnosis} onChange={e => set("diagnosis", e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label className="text-xs">Drugs Given</Label><Textarea className="rounded-xl" value={form.drugsGiven} onChange={e => set("drugsGiven", e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label className="text-xs">Glasses Prescribed</Label><Textarea className="rounded-xl" value={form.glassesPrescribed} onChange={e => set("glassesPrescribed", e.target.value)} rows={2} /></div>
            </div>
          </div>
        </TabsContent>

        {/* Past Visits */}
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
                        {v.diagnosis && <span className="text-muted-foreground ml-2 font-normal">— {v.diagnosis.slice(0, 50)}</span>}
                      </span>
                      <Button variant="ghost" size="sm" className="rounded-xl" onClick={(e) => { e.preventDefault(); generateVisitPdf(patient, v); }}>
                        <Download size={12} className="mr-1" /> Export
                      </Button>
                    </summary>
                    <div className="px-4 pb-4 text-xs space-y-2 border-t border-border/60 pt-3">
                      {v.chief_complaint && <div><strong>Chief Complaint:</strong> {v.chief_complaint}</div>}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        <div><strong>VA OD Dist:</strong> {v.va_od_distance || "—"}</div>
                        <div><strong>VA OS Dist:</strong> {v.va_os_distance || "—"}</div>
                        <div><strong>Pinhole OD:</strong> {v.pinhole_od || "—"}</div>
                      </div>
                      {(v.tonometry_od || v.tonometry_os) && (
                        <div><strong>IOP:</strong> OD {v.tonometry_od || "—"} / OS {v.tonometry_os || "—"} mmHg</div>
                      )}
                      {v.diagnosis && <div><strong>Diagnosis:</strong> {v.diagnosis}</div>}
                      {v.final_prescription && <div><strong>Rx:</strong> {v.final_prescription}</div>}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-20 lg:bottom-4 mt-6 flex justify-end">
        <Button onClick={handleSave} size="lg" className="shadow-lg rounded-2xl px-8" disabled={saving}>
          {saving ? "Saving..." : "Save Visit"}
        </Button>
      </div>
    </AppLayout>
  );
}
