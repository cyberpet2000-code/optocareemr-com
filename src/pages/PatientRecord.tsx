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
import { ArrowLeft, Eye, FileText, Stethoscope, ClipboardList, History, Pencil, Search as SearchIcon, Gauge, Scan, Download } from "lucide-react";
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
  intFundoscopyOd: "", intFundoscopyOs: "",
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
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className={`grid gap-2 ${showVa ? "grid-cols-5" : "grid-cols-4"}`}>
        <div />
        <Label className="text-xs text-center">Sphere</Label>
        <Label className="text-xs text-center">Cylinder</Label>
        <Label className="text-xs text-center">Axis</Label>
        {showVa && <Label className="text-xs text-center">VA</Label>}
        {["Od", "Os"].map(eye => (
          <div key={eye} className="contents">
            <Label className="text-sm flex items-center">{eye === "Od" ? "OD (R)" : "OS (L)"}</Label>
            {["Sphere", "Cylinder", "Axis"].map(field => (
              <Input
                key={`${prefix}${eye}${field}`}
                className="text-center text-sm h-9"
                value={form[`${prefix}${eye}${field}`] || ""}
                onChange={e => set(`${prefix}${eye}${field}`, e.target.value)}
                maxLength={20}
              />
            ))}
            {showVa && (
              <Input
                className="text-center text-sm h-9"
                value={form[`${vaKey}${eye}`] || ""}
                onChange={e => set(`${vaKey}${eye}`, e.target.value)}
                maxLength={20}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PatientData {
  id: number;
  full_name: string;
  age: number | null;
  gender: string | null;
  phone: string;
  address: string;
  insurance_name: string;
  enrollee_number: string;
  patient_type: string;
  hmo_provider: string;
  patient_uid: string;
  next_of_kin: string;
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

  if (isNaN(patientId)) {
    return <AppLayout><p className="text-center py-12 text-muted-foreground">Invalid patient ID.</p></AppLayout>;
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("visits").insert({
      patient_id: patientId,
      va_od_distance: form.vaOdDistance || null,
      va_os_distance: form.vaOsDistance || null,
      va_ou_distance: form.vaOuDistance || null,
      va_od_near: form.vaOdNear || null,
      va_os_near: form.vaOsNear || null,
      va_ou_near: form.vaOuNear || null,
      pinhole_od: form.pinholeOd || null,
      pinhole_os: form.pinholeOs || null,
      auto_od_sphere: form.autoOdSphere || null,
      auto_od_cylinder: form.autoOdCylinder || null,
      auto_od_axis: form.autoOdAxis || null,
      auto_os_sphere: form.autoOsSphere || null,
      auto_os_cylinder: form.autoOsCylinder || null,
      auto_os_axis: form.autoOsAxis || null,
      auto_va_od: form.autoVaOd || null,
      auto_va_os: form.autoVaOs || null,
      sub_od_sphere: form.subOdSphere || null,
      sub_od_cylinder: form.subOdCylinder || null,
      sub_od_axis: form.subOdAxis || null,
      sub_os_sphere: form.subOsSphere || null,
      sub_os_cylinder: form.subOsCylinder || null,
      sub_os_axis: form.subOsAxis || null,
      sub_va_od: form.subVaOd || null,
      sub_va_os: form.subVaOs || null,
      reading_add_od: form.readingAddOd || null,
      reading_add_os: form.readingAddOs || null,
      reading_add_va_od: form.readingAddVaOd || null,
      reading_add_va_os: form.readingAddVaOs || null,
      final_prescription: form.finalPrescription || null,
      chief_complaint: form.chiefComplaint || null,
      duration: form.duration || null,
      ocular_history: form.ocularHistory || null,
      medical_history: form.medicalHistory || null,
      ext_lids: form.extLids || null,
      ext_conjunctiva: form.extConjunctiva || null,
      ext_cornea: form.extCornea || null,
      int_fundoscopy_od: form.intFundoscopyOd || null,
      int_fundoscopy_os: form.intFundoscopyOs || null,
      int_cdr_od: form.intCdrOd || null,
      int_cdr_os: form.intCdrOs || null,
      int_fundus_bg: form.intFundusBg || null,
      tonometry_od: form.tonometryOd || null,
      tonometry_os: form.tonometryOs || null,
      tonometry_time: form.tonometryTime || null,
      tonometry_ampm: form.tonometryAmpm || null,
      diagnosis: form.diagnosis || null,
      drugs_given: form.drugsGiven || null,
      glasses_prescribed: form.glassesPrescribed || null,
    } as any);

    setSaving(false);
    if (error) {
      toast.error("Failed to save visit: " + error.message);
      return;
    }
    toast.success("Visit saved successfully");
    setForm(emptyForm());
    const { data } = await supabase.from("visits").select("*").eq("patient_id", patientId).order("created_at", { ascending: false });
    if (data) setVisits(data);
  };

  const handleEditPatient = async () => {
    const { error } = await supabase.from("patients").update({
      full_name: editForm.full_name,
      age: editForm.age,
      gender: editForm.gender,
      phone: editForm.phone,
      address: editForm.address,
      next_of_kin: editForm.next_of_kin,
      patient_type: editForm.patient_type,
      hmo_provider: editForm.hmo_provider,
      insurance_name: editForm.patient_type === "HMO" ? editForm.hmo_provider : "",
      enrollee_number: editForm.enrollee_number,
    }).eq("id", patientId);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient info updated");
    setPatient({ ...patient!, ...editForm } as PatientData);
    setEditing(false);
  };

  if (loading) {
    return <AppLayout><p className="text-center py-12 text-muted-foreground">Loading...</p></AppLayout>;
  }
  if (!patient) {
    return <AppLayout><p className="text-center py-12 text-muted-foreground">Patient not found.</p></AppLayout>;
  }

  return (
    <AppLayout>
      <Link to="/patients" className="text-sm text-primary hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to Patients
      </Link>

      {/* Patient Header */}
      <div className="medical-card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{patient.full_name}</h1>
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{patient.patient_uid}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${patient.patient_type === "HMO" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}>
                {patient.patient_type}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {patient.gender}, {patient.age} yrs • {patient.phone}
              {patient.patient_type === "HMO" && patient.hmo_provider && ` • ${patient.hmo_provider} (${patient.enrollee_number})`}
            </p>
            {patient.address && <p className="text-sm text-muted-foreground">{patient.address}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => { setEditing(true); setEditForm(patient); }}>
            <Pencil size={14} className="mr-1" /> Edit
          </Button>
        </div>
      </div>

      {/* Edit Patient Dialog */}
      {editing && (
        <div className="form-section mb-6 max-w-2xl border-2 border-primary/20">
          <h2 className="section-title mb-3">Edit Patient Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Full Name</Label><Input value={editForm.full_name || ""} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Age</Label><Input type="number" value={editForm.age ?? ""} onChange={e => setEditForm(f => ({ ...f, age: parseInt(e.target.value) || null }))} /></div>
              <div className="space-y-1"><Label>Gender</Label>
                <Select value={editForm.gender || ""} onValueChange={v => setEditForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Phone</Label><Input value={editForm.phone || ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Next of Kin</Label><Input value={editForm.next_of_kin || ""} onChange={e => setEditForm(f => ({ ...f, next_of_kin: e.target.value }))} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Address</Label><Textarea value={editForm.address || ""} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} rows={2} /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleEditPatient}>Save Changes</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="exam" className="space-y-4">
        <TabsList className="w-full flex overflow-x-auto">
          <TabsTrigger value="exam" className="flex items-center gap-1.5 text-xs"><Eye size={14} /> VA & Refraction</TabsTrigger>
          <TabsTrigger value="examination" className="flex items-center gap-1.5 text-xs"><Scan size={14} /> Examination</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs"><ClipboardList size={14} /> Case History</TabsTrigger>
          <TabsTrigger value="diagnosis" className="flex items-center gap-1.5 text-xs"><Stethoscope size={14} /> Diagnosis</TabsTrigger>
          <TabsTrigger value="visits" className="flex items-center gap-1.5 text-xs"><History size={14} /> Past Visits</TabsTrigger>
        </TabsList>

        {/* TAB: VA & REFRACTION */}
        <TabsContent value="exam" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title"><Eye size={18} /> Visual Acuity</h2>
            <div className="grid grid-cols-5 gap-2">
              <div />
              <Label className="text-xs text-center">Distance</Label>
              <Label className="text-xs text-center">Near</Label>
              <Label className="text-xs text-center">Pinhole</Label>
              <div />
              {[
                { key: "Od", label: "OD (R)" },
                { key: "Os", label: "OS (L)" },
                { key: "Ou", label: "OU" },
              ].map(eye => (
                <div key={eye.key} className="contents">
                  <Label className="text-sm flex items-center">{eye.label}</Label>
                  <Input className="text-center text-sm h-9" value={form[`va${eye.key}Distance`] || ""} onChange={e => set(`va${eye.key}Distance`, e.target.value)} maxLength={20} />
                  <Input className="text-center text-sm h-9" value={form[`va${eye.key}Near`] || ""} onChange={e => set(`va${eye.key}Near`, e.target.value)} maxLength={20} />
                  {eye.key !== "Ou" ? (
                    <Input className="text-center text-sm h-9" value={form[`pinhole${eye.key}`] || ""} onChange={e => set(`pinhole${eye.key}`, e.target.value)} maxLength={20} />
                  ) : <div />}
                  <div />
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title"><FileText size={18} /> Refraction</h2>
            <RefractionGrid label="Auto Refraction" prefix="auto" form={form} set={set} showVa />
            <div className="border-t border-border pt-4">
              <RefractionGrid label="Subjective Refraction" prefix="sub" form={form} set={set} showVa />
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Reading Add</p>
              <div className="grid grid-cols-3 gap-2">
                <div />
                <Label className="text-xs text-center">Add</Label>
                <Label className="text-xs text-center">VA</Label>
                {["Od", "Os"].map(eye => (
                  <div key={eye} className="contents">
                    <Label className="text-sm flex items-center">{eye === "Od" ? "OD (R)" : "OS (L)"}</Label>
                    <Input className="text-center text-sm h-9" value={form[`readingAdd${eye}`] || ""} onChange={e => set(`readingAdd${eye}`, e.target.value)} maxLength={20} />
                    <Input className="text-center text-sm h-9" value={form[`readingAddVa${eye}`] || ""} onChange={e => set(`readingAddVa${eye}`, e.target.value)} maxLength={20} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title">Final Prescription</h2>
            <Textarea value={form.finalPrescription || ""} onChange={e => set("finalPrescription", e.target.value)} rows={3} placeholder="Enter final prescription..." maxLength={1000} />
          </div>
        </TabsContent>

        {/* TAB: EXAMINATION */}
        <TabsContent value="examination" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title"><SearchIcon size={18} /> External Examination</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Lids</Label><Textarea value={form.extLids} onChange={e => set("extLids", e.target.value)} rows={2} maxLength={300} /></div>
              <div className="space-y-1.5"><Label>Conjunctiva</Label><Textarea value={form.extConjunctiva} onChange={e => set("extConjunctiva", e.target.value)} rows={2} maxLength={300} /></div>
              <div className="space-y-1.5"><Label>Cornea</Label><Textarea value={form.extCornea} onChange={e => set("extCornea", e.target.value)} rows={2} maxLength={300} /></div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title"><Eye size={18} /> Internal Examination</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Fundoscopy OD</Label><Textarea value={form.intFundoscopyOd} onChange={e => set("intFundoscopyOd", e.target.value)} rows={2} maxLength={300} /></div>
              <div className="space-y-1.5"><Label>Fundoscopy OS</Label><Textarea value={form.intFundoscopyOs} onChange={e => set("intFundoscopyOs", e.target.value)} rows={2} maxLength={300} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3">
              <div className="space-y-1.5"><Label>CDR OD</Label><Input value={form.intCdrOd} onChange={e => set("intCdrOd", e.target.value)} placeholder="e.g. 0.3" maxLength={10} /></div>
              <div className="space-y-1.5"><Label>CDR OS</Label><Input value={form.intCdrOs} onChange={e => set("intCdrOs", e.target.value)} placeholder="e.g. 0.3" maxLength={10} /></div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Fundus Background</Label><Textarea value={form.intFundusBg} onChange={e => set("intFundusBg", e.target.value)} rows={2} maxLength={300} /></div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title"><Gauge size={18} /> Tonometry</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5"><Label>IOP OD (mmHg)</Label><Input value={form.tonometryOd} onChange={e => set("tonometryOd", e.target.value)} placeholder="e.g. 16" maxLength={10} /></div>
              <div className="space-y-1.5"><Label>IOP OS (mmHg)</Label><Input value={form.tonometryOs} onChange={e => set("tonometryOs", e.target.value)} placeholder="e.g. 16" maxLength={10} /></div>
              <div className="space-y-1.5"><Label>Time</Label><Input value={form.tonometryTime} onChange={e => set("tonometryTime", e.target.value)} placeholder="e.g. 10:30" maxLength={10} /></div>
              <div className="space-y-1.5"><Label>AM/PM</Label>
                <Select value={form.tonometryAmpm} onValueChange={v => set("tonometryAmpm", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: CASE HISTORY */}
        <TabsContent value="history" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title"><ClipboardList size={18} /> Case History</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Chief Complaint</Label><Textarea value={form.chiefComplaint} onChange={e => set("chiefComplaint", e.target.value)} rows={2} maxLength={500} /></div>
              <div className="space-y-1.5"><Label>Duration</Label><Input value={form.duration} onChange={e => set("duration", e.target.value)} maxLength={100} /></div>
              <div className="space-y-1.5"><Label>Ocular History</Label><Textarea value={form.ocularHistory} onChange={e => set("ocularHistory", e.target.value)} rows={3} maxLength={500} /></div>
              <div className="space-y-1.5"><Label>Medical History</Label><Textarea value={form.medicalHistory} onChange={e => set("medicalHistory", e.target.value)} rows={3} maxLength={500} /></div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: DIAGNOSIS */}
        <TabsContent value="diagnosis" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title"><Stethoscope size={18} /> Diagnosis & Treatment</h2>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Diagnosis</Label><Textarea value={form.diagnosis} onChange={e => set("diagnosis", e.target.value)} rows={2} maxLength={500} /></div>
              <div className="space-y-1.5"><Label>Drugs Given</Label><Textarea value={form.drugsGiven} onChange={e => set("drugsGiven", e.target.value)} rows={2} maxLength={500} /></div>
              <div className="space-y-1.5"><Label>Glasses Prescribed</Label><Textarea value={form.glassesPrescribed} onChange={e => set("glassesPrescribed", e.target.value)} rows={2} maxLength={500} /></div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: PAST VISITS */}
        <TabsContent value="visits">
          <div className="medical-card">
            <h2 className="section-title mb-4"><History size={18} /> Visit History</h2>
            {visits.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No previous visits recorded.</p>
            ) : (
              <div className="space-y-4">
                {visits.map((v: any) => (
                  <details key={v.id} className="border border-border rounded-lg">
                    <summary className="px-4 py-3 cursor-pointer hover:bg-muted/50 rounded-lg font-medium text-sm flex items-center justify-between">
                      <span>
                        {new Date(v.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        {v.diagnosis && <span className="text-muted-foreground ml-2">— {v.diagnosis.slice(0, 60)}</span>}
                      </span>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); generateVisitPdf(patient, v); }}>
                        <Download size={14} className="mr-1" /> Export
                      </Button>
                    </summary>
                    <div className="px-4 pb-4 text-sm space-y-3 border-t border-border pt-3">
                      {v.chief_complaint && <div><strong>Chief Complaint:</strong> {v.chief_complaint}</div>}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div><strong>VA OD Dist:</strong> {v.va_od_distance || "—"}</div>
                        <div><strong>VA OS Dist:</strong> {v.va_os_distance || "—"}</div>
                        <div><strong>VA OU Dist:</strong> {v.va_ou_distance || "—"}</div>
                        <div><strong>Pinhole OD:</strong> {v.pinhole_od || "—"}</div>
                        <div><strong>Pinhole OS:</strong> {v.pinhole_os || "—"}</div>
                      </div>
                      {(v.tonometry_od || v.tonometry_os) && (
                        <div className="text-xs"><strong>IOP:</strong> OD {v.tonometry_od || "—"} / OS {v.tonometry_os || "—"} mmHg {v.tonometry_time && `at ${v.tonometry_time} ${v.tonometry_ampm || ""}`}</div>
                      )}
                      {v.final_prescription && <div><strong>Rx:</strong> {v.final_prescription}</div>}
                      {v.diagnosis && <div><strong>Diagnosis:</strong> {v.diagnosis}</div>}
                      {v.drugs_given && <div><strong>Drugs:</strong> {v.drugs_given}</div>}
                      {v.glasses_prescribed && <div><strong>Glasses:</strong> {v.glasses_prescribed}</div>}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 mt-6 flex justify-end">
        <Button onClick={handleSave} size="lg" className="shadow-lg" disabled={saving}>
          {saving ? "Saving..." : "Save Visit Record"}
        </Button>
      </div>
    </AppLayout>
  );
}
