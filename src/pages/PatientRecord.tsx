import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Eye, FileText, Stethoscope, ClipboardList, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const emptyForm = () => ({
  vaOdDistance: "", vaOsDistance: "", vaOuDistance: "",
  vaOdNear: "", vaOsNear: "", vaOuNear: "",
  autoOdSphere: "", autoOdCylinder: "", autoOdAxis: "",
  autoOsSphere: "", autoOsCylinder: "", autoOsAxis: "",
  subOdSphere: "", subOdCylinder: "", subOdAxis: "",
  subOsSphere: "", subOsCylinder: "", subOsAxis: "",
  finalPrescription: "",
  chiefComplaint: "", duration: "", ocularHistory: "", medicalHistory: "",
  diagnosis: "", drugsGiven: "", glassesPrescribed: "",
});

function RefractionGrid({ label, prefix, form, set }: {
  label: string; prefix: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        <div />
        <Label className="text-xs text-center">Sphere</Label>
        <Label className="text-xs text-center">Cylinder</Label>
        <Label className="text-xs text-center">Axis</Label>
        {["Od", "Os"].map(eye => (
          <>
            <Label key={`${eye}-label`} className="text-sm flex items-center">{eye === "Od" ? "OD (R)" : "OS (L)"}</Label>
            {["Sphere", "Cylinder", "Axis"].map(field => (
              <Input
                key={`${prefix}${eye}${field}`}
                className="text-center text-sm h-9"
                value={form[`${prefix}${eye}${field}`] || ""}
                onChange={e => set(`${prefix}${eye}${field}`, e.target.value)}
                maxLength={20}
              />
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

interface PatientData {
  id: number;
  full_name: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  insurance_name: string;
  enrollee_number: string;
}

interface VisitRow {
  id: number;
  created_at: string;
  patient_id: number;
  va_od_distance: string | null;
  va_os_distance: string | null;
  va_ou_distance: string | null;
  va_od_near: string | null;
  va_os_near: string | null;
  va_ou_near: string | null;
  auto_od_sphere: string | null;
  auto_od_cylinder: string | null;
  auto_od_axis: string | null;
  auto_os_sphere: string | null;
  auto_os_cylinder: string | null;
  auto_os_axis: string | null;
  sub_od_sphere: string | null;
  sub_od_cylinder: string | null;
  sub_od_axis: string | null;
  sub_os_sphere: string | null;
  sub_os_cylinder: string | null;
  sub_os_axis: string | null;
  final_prescription: string | null;
  chief_complaint: string | null;
  duration: string | null;
  ocular_history: string | null;
  medical_history: string | null;
  diagnosis: string | null;
  drugs_given: string | null;
  glasses_prescribed: string | null;
}

export default function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  const patientId = id ? parseInt(id, 10) : NaN;

  if (isNaN(patientId)) {
    return <AppLayout><p className="text-center py-12 text-muted-foreground">Invalid patient ID.</p></AppLayout>;
  }
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  useEffect(() => {
    async function load() {
      const [patRes, visRes] = await Promise.all([
        supabase.from("Patients").select("*").eq("id", patientId).maybeSingle(),
        supabase.from("Visits").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
      ]);
      if (patRes.data) setPatient(patRes.data as unknown as PatientData);
      if (visRes.data) setVisits(visRes.data as unknown as VisitRow[]);
      setLoading(false);
    }
    load();
  }, [patientId]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("Visits").insert({
      patient_id: patientId,
      va_od_distance: form.vaOdDistance || null,
      va_os_distance: form.vaOsDistance || null,
      va_ou_distance: form.vaOuDistance || null,
      va_od_near: form.vaOdNear || null,
      va_os_near: form.vaOsNear || null,
      va_ou_near: form.vaOuNear || null,
      auto_od_sphere: form.autoOdSphere || null,
      auto_od_cylinder: form.autoOdCylinder || null,
      auto_od_axis: form.autoOdAxis || null,
      auto_os_sphere: form.autoOsSphere || null,
      auto_os_cylinder: form.autoOsCylinder || null,
      auto_os_axis: form.autoOsAxis || null,
      sub_od_sphere: form.subOdSphere || null,
      sub_od_cylinder: form.subOdCylinder || null,
      sub_od_axis: form.subOdAxis || null,
      sub_os_sphere: form.subOsSphere || null,
      sub_os_cylinder: form.subOsCylinder || null,
      sub_os_axis: form.subOsAxis || null,
      final_prescription: form.finalPrescription || null,
      chief_complaint: form.chiefComplaint || null,
      duration: form.duration || null,
      ocular_history: form.ocularHistory || null,
      medical_history: form.medicalHistory || null,
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
    // Refresh visits
    const { data } = await supabase.from("Visits").select("*").eq("patient_id", patientId).order("created_at", { ascending: false });
    if (data) setVisits(data as unknown as VisitRow[]);
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

      <div className="medical-card mb-6">
        <h1 className="text-xl font-bold">{patient.full_name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {patient.gender}, {patient.age} yrs • {patient.phone}
          {patient.insurance_name && ` • ${patient.insurance_name} (${patient.enrollee_number})`}
        </p>
        {patient.address && <p className="text-sm text-muted-foreground">{patient.address}</p>}
      </div>

      <Tabs defaultValue="exam" className="space-y-4">
        <TabsList className="w-full flex overflow-x-auto">
          <TabsTrigger value="exam" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Eye size={14} /> Examination
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <ClipboardList size={14} /> Case History
          </TabsTrigger>
          <TabsTrigger value="diagnosis" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Stethoscope size={14} /> Diagnosis
          </TabsTrigger>
          <TabsTrigger value="visits" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <History size={14} /> Past Visits
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exam" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title"><Eye size={18} /> Visual Acuity</h2>
            <div className="grid grid-cols-4 gap-2">
              <div />
              <Label className="text-xs text-center">Distance</Label>
              <Label className="text-xs text-center">Near</Label>
              <div />
              {[
                { key: "Od", label: "OD (R)" },
                { key: "Os", label: "OS (L)" },
                { key: "Ou", label: "OU" },
              ].map(eye => (
                <>
                  <Label key={`va-${eye.key}`} className="text-sm flex items-center">{eye.label}</Label>
                  <Input className="text-center text-sm h-9" value={form[`va${eye.key}Distance`] || ""} onChange={e => set(`va${eye.key}Distance`, e.target.value)} maxLength={20} />
                  <Input className="text-center text-sm h-9" value={form[`va${eye.key}Near`] || ""} onChange={e => set(`va${eye.key}Near`, e.target.value)} maxLength={20} />
                  <div />
                </>
              ))}
            </div>
          </div>
          <div className="form-section">
            <h2 className="section-title"><FileText size={18} /> Refraction</h2>
            <RefractionGrid label="Auto Refraction" prefix="auto" form={form} set={set} />
            <div className="border-t border-border pt-4">
              <RefractionGrid label="Subjective Refraction" prefix="sub" form={form} set={set} />
            </div>
          </div>
          <div className="form-section">
            <h2 className="section-title">Final Prescription</h2>
            <Textarea value={form.finalPrescription || ""} onChange={e => set("finalPrescription", e.target.value)} rows={3} placeholder="Enter final prescription..." maxLength={1000} />
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title"><ClipboardList size={18} /> Case History</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Chief Complaint</Label>
                <Textarea value={form.chiefComplaint || ""} onChange={e => set("chiefComplaint", e.target.value)} rows={2} maxLength={500} />
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Input value={form.duration || ""} onChange={e => set("duration", e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label>Ocular History</Label>
                <Textarea value={form.ocularHistory || ""} onChange={e => set("ocularHistory", e.target.value)} rows={3} maxLength={500} />
              </div>
              <div className="space-y-1.5">
                <Label>Medical History</Label>
                <Textarea value={form.medicalHistory || ""} onChange={e => set("medicalHistory", e.target.value)} rows={3} maxLength={500} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="diagnosis" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title"><Stethoscope size={18} /> Diagnosis & Treatment</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Diagnosis</Label>
                <Textarea value={form.diagnosis || ""} onChange={e => set("diagnosis", e.target.value)} rows={2} maxLength={500} />
              </div>
              <div className="space-y-1.5">
                <Label>Drugs Given</Label>
                <Textarea value={form.drugsGiven || ""} onChange={e => set("drugsGiven", e.target.value)} rows={2} maxLength={500} />
              </div>
              <div className="space-y-1.5">
                <Label>Glasses Prescribed</Label>
                <Textarea value={form.glassesPrescribed || ""} onChange={e => set("glassesPrescribed", e.target.value)} rows={2} maxLength={500} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="visits">
          <div className="medical-card">
            <h2 className="section-title mb-4"><History size={18} /> Visit History</h2>
            {visits.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No previous visits recorded.</p>
            ) : (
              <div className="space-y-4">
                {visits.map(v => (
                  <details key={v.id} className="border border-border rounded-lg">
                    <summary className="px-4 py-3 cursor-pointer hover:bg-muted/50 rounded-lg font-medium text-sm">
                      {new Date(v.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                      {v.diagnosis && <span className="text-muted-foreground ml-2">— {v.diagnosis.slice(0, 60)}</span>}
                    </summary>
                    <div className="px-4 pb-4 text-sm space-y-3 border-t border-border pt-3">
                      {v.chief_complaint && <div><strong>Chief Complaint:</strong> {v.chief_complaint}</div>}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div><strong>VA OD Dist:</strong> {v.va_od_distance || "—"}</div>
                        <div><strong>VA OS Dist:</strong> {v.va_os_distance || "—"}</div>
                        <div><strong>VA OU Dist:</strong> {v.va_ou_distance || "—"}</div>
                      </div>
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
