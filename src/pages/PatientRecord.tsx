import OptoLoader from "@/components/OptoLoader";
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  Stethoscope,
  ClipboardList,
  History,
  Pencil,
  Gauge,
  Download,
  Phone,
  MessageCircle,
  CheckCircle2,
  Pill,
  FileText,
} from "lucide-react";
import { generateVisitPdf } from "@/lib/visitPdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess } from "@/hooks/useAccess";
import {
  QuickPicker, PickerChips,

  CHIEF_COMPLAINT_OPTIONS,
  HISTORY_OPTIONS,
  EXAM_OPTIONS,
  VA_DISTANCE_OPTIONS, VA_NEAR_OPTIONS,
  SPHERE_OPTIONS, CYL_OPTIONS, ADD_OPTIONS, AXIS_OPTIONS,
  REFRACTIVE_ERROR_OPTIONS, LENS_RECOMMENDATION_OPTIONS,
  ADVICE_OPTIONS, REFERRAL_OPTIONS, DIAGNOSIS_GROUPS,
  isValidPower, isValidAxis, isValidVaDistance, isValidVaNear,
} from "@/components/QuickPicker";
import { MedicationPicker, type MedItem } from "@/components/MedicationPicker";
import { AbbrTip } from "@/components/AbbrTip";
import { HMOVerificationCard, type HmoVerifStatus } from "@/components/HMOVerificationCard";
import {
  MoreVertical,
  Trash2,
  Archive
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


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
  hmo_coverage_type?: string | null;
  hmo_principal_name?: string | null;
  hmo_relationship?: string | null;
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
  diagnosis: "",
lensType: "",
medication: "",
notes: "",
});

export default function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  const patientId = id || "";
  const { effectiveClinicId: cid, role } = useAccess();
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [hmos, setHmos] = useState<{ id: string; name: string; website?: string | null }[]>([]);
  const [hmoMap, setHmoMap] = useState<Map<string, { name: string; website?: string | null }>>(new Map());
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingVisitId, setEditingVisitId] =
  useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PatientData>>({});
  const [form, setForm] = useState(emptyVisitForm());
  const [medications, setMedications] = useState<MedItem[]>([]);


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
    .select("id, name, website")
    .eq("clinic_id", cid)
    .eq("status", "active"),

  apiClient
    .from("clinics")
    .select("name")
    .eq("id", cid)
    .maybeSingle(),
]);
        
      console.debug("[patient-record]", { clinic_id: cid, patient_id: patientId, visits: visRes.data?.length ?? 0 });
  if (patRes.data) {
  const activeHmo =
    hmoRes.data?.find(
      (h: any) => h.id === patRes.data.active_hmo_id
    );

  setPatient({
    ...patRes.data,
    clinic_name: clinicRes.data?.name || "",
    hmo_name: activeHmo?.name || "",
  } as any);
  }
      if (visRes.data) {
  console.log("VISITS FROM DB", visRes.data);
  setVisits(visRes.data);
      }
      if (hmoRes.data) {
        setHmos(hmoRes.data as any);
        setHmoMap(new Map((hmoRes.data as any[]).map(h => [h.id, { name: h.name, website: h.website }])));
      }
      // Load clinic medications (drug inventory)
      const { data: medRes } = await apiClient
        .from("inventory")
        .select("id, name, drug_category, category")
        .eq("clinic_id", cid);

    console.log("inventory meds:", medRes);

if (medRes) {
  const meds = (medRes as any[])
    .filter(m => m.name)
    .map(m => ({
      id: m.id,
      name: m.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log("mapped meds:", meds);

  setMedications(meds);
}
      
      setLoading(false);
    })();
  }, [patientId, cid]);


  const setField = (k: string, v: string) =>
  setForm(prev => ({
    ...prev,
    [k]: v,
  }));
  const startEditVisit = (v: any) => {
  setEditingVisitId(v.id);
    console.log("Editing visit:", v.id);

  setForm({
    ...emptyVisitForm(),

    chiefComplaint: v.chief_complaint || "",
    history: v.history || "",
    examination: v.examination || "",
    diagnosis: v.diagnosis || "",
    lensType: v.lens_type || "",
    medication: v.medication || "",
    notes: v.notes || "",

    vaUnaidedOd: v.va_unaided_od || "",
vaUnaidedOs: v.va_unaided_os || "",
vaUnaidedOu: v.va_unaided_ou || "",

vaUnaidedOdPh: v.va_unaided_od_ph || "",
vaUnaidedOsPh: v.va_unaided_os_ph || "",

vaUnaidedNearOu: v.va_unaided_near_ou || "",

vaAidedOd: v.va_aided_od || "",
vaAidedOs: v.va_aided_os || "",
vaAidedOu: v.va_aided_ou || "",
vaAidedNearOu: v.va_aided_near_ou || "",

autoOdSphere: v.auto_od_sphere || "",
autoOdCyl: v.auto_od_cyl || "",
autoOdAxis: v.auto_od_axis || "",
autoVaOd: v.auto_va_od || "",

autoOsSphere: v.auto_os_sphere || "",
autoOsCyl: v.auto_os_cyl || "",
autoOsAxis: v.auto_os_axis || "",
autoVaOs: v.auto_va_os || "",

subOdSphere: v.sub_od_sphere || "",
subOdCyl: v.sub_od_cyl || "",
subOdAxis: v.sub_od_axis || "",
subVaOd: v.sub_va_od || "",

subOsSphere: v.sub_os_sphere || "",
subOsCyl: v.sub_os_cyl || "",
subOsAxis: v.sub_os_axis || "",
subVaOs: v.sub_va_os || "",

subReadingAdd: v.sub_reading_add || "",
subVaOutcome: v.sub_va_outcome || "",

    iopOd: v.iop_od?.toString() || "",
    iopOs: v.iop_os?.toString() || "",
    iopTime: v.iop_time || "",
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};


  const handleSaveVisit = async (markCompleted: boolean) => {
    if (!patient) return;
    if (!cid) { toast.error("No active clinic"); return; }

    // Validation
    const vaDistFields: [string, string][] = [
      ["Unaided OD", form.vaUnaidedOd], ["Unaided OS", form.vaUnaidedOs], ["Unaided OU", form.vaUnaidedOu],
      ["Pinhole OD", form.vaUnaidedOdPh], ["Pinhole OS", form.vaUnaidedOsPh],
      ["Aided OD", form.vaAidedOd], ["Aided OS", form.vaAidedOs], ["Aided OU", form.vaAidedOu],
      ["Auto VA OD", form.autoVaOd], ["Auto VA OS", form.autoVaOs],
      ["Sub VA OD", form.subVaOd], ["Sub VA OS", form.subVaOs],
    ];
    for (const [label, val] of vaDistFields) {
      if (!isValidVaDistance(val)) { toast.error(`Invalid VA value for ${label}: "${val}"`); return; }
    }
    const vaNearFields: [string, string][] = [
      ["Near Unaided", form.vaUnaidedNearOu], ["Near Aided", form.vaAidedNearOu],
      ["VA Outcome", form.subVaOutcome],
    ];
    for (const [label, val] of vaNearFields) {
      if (!isValidVaNear(val)) { toast.error(`Invalid Near VA for ${label}: "${val}"`); return; }
    }
    const powerFields: [string, string][] = [
      ["Auto OD Sphere", form.autoOdSphere], ["Auto OD Cyl", form.autoOdCyl],
      ["Auto OS Sphere", form.autoOsSphere], ["Auto OS Cyl", form.autoOsCyl],
      ["Sub OD Sphere", form.subOdSphere], ["Sub OD Cyl", form.subOdCyl],
      ["Sub OS Sphere", form.subOsSphere], ["Sub OS Cyl", form.subOsCyl],
      ["Reading ADD", form.subReadingAdd],
    ];
    for (const [label, val] of powerFields) {
      if (!isValidPower(val)) { toast.error(`${label} must be in 0.25 steps (e.g. -1.25): "${val}"`); return; }
    }
    const axisFields: [string, string][] = [
      ["Auto OD Axis", form.autoOdAxis], ["Auto OS Axis", form.autoOsAxis],
      ["Sub OD Axis", form.subOdAxis], ["Sub OS Axis", form.subOsAxis],
    ];
    for (const [label, val] of axisFields) {
      if (!isValidAxis(val)) { toast.error(`${label} must be 1–180: "${val}"`); return; }
    }

    setSaving(true);

const visitPayload = {
  clinic_id: cid,
  patient_id: patient.id,
  payment_type: patient.payment_type,
  active_hmo_id: patient.active_hmo_id,

  chief_complaint: form.chiefComplaint || null,
  history: form.history || null,
  old_lens_prescription: form.oldLensPrescription || null,

  va_unaided_od: form.vaUnaidedOd || null,
  va_unaided_os: form.vaUnaidedOs || null,
  va_unaided_ou: form.vaUnaidedOu || null,

  va_unaided_od_ph: form.vaUnaidedOdPh || null,
  va_unaided_os_ph: form.vaUnaidedOsPh || null,

  va_unaided_near_ou: form.vaUnaidedNearOu || null,

  va_aided_od: form.vaAidedOd || null,
  va_aided_os: form.vaAidedOs || null,
  va_aided_ou: form.vaAidedOu || null,

  va_aided_near_ou: form.vaAidedNearOu || null,

  auto_od_sphere: form.autoOdSphere || null,
  auto_od_cyl: form.autoOdCyl || null,
  auto_od_axis: form.autoOdAxis || null,
  auto_va_od: form.autoVaOd || null,

  auto_os_sphere: form.autoOsSphere || null,
  auto_os_cyl: form.autoOsCyl || null,
  auto_os_axis: form.autoOsAxis || null,
  auto_va_os: form.autoVaOs || null,

  sub_od_sphere: form.subOdSphere || null,
  sub_od_cyl: form.subOdCyl || null,
  sub_od_axis: form.subOdAxis || null,
  sub_va_od: form.subVaOd || null,

  sub_os_sphere: form.subOsSphere || null,
  sub_os_cyl: form.subOsCyl || null,
  sub_os_axis: form.subOsAxis || null,
  sub_va_os: form.subVaOs || null,

  sub_reading_add: form.subReadingAdd || null,
  sub_va_outcome: form.subVaOutcome || null,

  examination: form.examination || null,

  iop_od: form.iopOd ? Number(form.iopOd) : null,
  iop_os: form.iopOs ? Number(form.iopOs) : null,
  iop_time: form.iopTime || null,

  diagnosis: form.diagnosis || null,
  lens_type: form.lensType || null,
  medication: form.medication || null,
  notes: form.notes || null,

  status: markCompleted ? "completed" : "open",
  completed_at: markCompleted
    ? new Date().toISOString()
    : null,
};

const { data, error } = editingVisitId
  ? await apiClient
      .from("visits")
      .update(visitPayload)
      .eq("id", editingVisitId)
      .select()
      .single()
  : await apiClient
      .from("visits")
      .insert(visitPayload)
      .select()
      .single();
    setSaving(false);
    if (error) { toast.error("Failed to save visit: " + error.message); return; }
    toast.success(markCompleted ? "Visit completed — bill auto-created" : "Visit saved");
    setEditingVisitId(null);
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
      hmo_coverage_type:
      editForm.payment_type === "hmo"
    ? editForm.hmo_coverage_type
    : null,

hmo_principal_name:
  editForm.payment_type === "hmo"
    ? editForm.hmo_principal_name
    : null,

hmo_relationship:
  editForm.payment_type === "hmo"
    ? editForm.hmo_relationship
    : null,
    } as any).eq("clinic_id", cid).eq("id", patient.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient info updated");
    setPatient({ ...patient, ...editForm } as PatientData);
    setEditing(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>;
  if (!patient) return <p className="text-center py-12 text-muted-foreground">Patient not found.</p>;

  const totalVisits = visits.length;
  const lastVisit = visits.length > 0 ? visits[0] : null;
  const lastRx =
  visits.find(
    v =>
      v.sub_od_sphere ||
      v.sub_os_sphere
  ) || null;

  const whatsappNumber = patient?.phone
  ?.replace(/\D/g, "")
  ?.replace(/^0/, "234");
  
  const hmoEntry = patient.active_hmo_id ? hmoMap.get(patient.active_hmo_id) : null;
  const isHmo = patient.payment_type === "hmo";
  const hmoName = hmoEntry?.name || null;
  const hmoWebsite = hmoEntry?.website || null;

  console.log("Current editingVisitId:", editingVisitId);

  return (
    <>
      <Link to="/patients" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={12} /> Back
      </Link>

      <div className="
mb-5
rounded-3xl
border
bg-gradient-to-r
from-primary/5
to-accent/5
p-5
shadow-sm
">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
  className="
  w-14
  h-14
  rounded-2xl
  flex
  items-center
  justify-center
  text-white
  shadow-md
  shrink-0
  "
  style={{
    background:
      "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)"
  }}
>
  <span className="text-lg font-bold text-white">
    {(patient.full_name || "?")[0]}
  </span>
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

              <div className="flex flex-wrap gap-2 mt-2">
  <span className="text-[10px] px-2 py-1 rounded-full bg-muted">
    Queue #{patient.queue_number}
  </span>

  <span className="text-[10px] px-2 py-1 rounded-full bg-muted">
    {totalVisits} Visits
  </span>

  {lastVisit && (
    <span className="text-[10px] px-2 py-1 rounded-full bg-muted">
      Last Visit{" "}
      {new Date(
        lastVisit.created_at
      ).toLocaleDateString()}
    </span>
  )}
</div>

{isHmo && patient.enrollee_number && (
  <p className="text-xs text-accent font-medium mt-1">
    Enrollee No: {patient.enrollee_number}
  </p>
)}
              {isHmo &&
  patient.hmo_coverage_type ===
    "dependent" && (
    <p className="text-[11px] text-muted-foreground mt-1">
      Dependent HMO
    </p>
)}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {patient.phone && (
              <>
                <a href={`tel:${patient.phone}`} className="
w-10
h-10
rounded-full
bg-green-50
flex
items-center
justify-center
hover:bg-green-100
transition-colors
"><Phone size={14} className="text-success" /></a>
                <a
  href={`https://wa.me/${whatsappNumber}`}
  target="_blank"
  rel="noopener noreferrer"
  className="
  w-10
  h-10
  rounded-full
  bg-green-50
  flex
  items-center
  justify-center
  hover:bg-green-100
  transition-colors
"
>
  <MessageCircle
    size={14}
    className="text-success"
  />
</a>
              </>
            )}
            
            <DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      className="rounded-xl"
    >
      <MoreVertical size={18} />
    </Button>
  </DropdownMenuTrigger>

  <DropdownMenuContent align="end">

    <DropdownMenuItem
      onClick={() => {
        setEditing(true);

        setEditForm({
          ...patient,
          hmo_coverage_type:
            patient.hmo_coverage_type || "principal",
          hmo_principal_name:
            (patient as any).hmo_principal_name || "",
          hmo_relationship:
            (patient as any).hmo_relationship || "",
        });
      }}
    >
      <Pencil className="mr-2 h-4 w-4" />
      Edit Patient
    </DropdownMenuItem>

    <DropdownMenuItem>
      <Download className="mr-2 h-4 w-4" />
      Export Record
    </DropdownMenuItem>

    <DropdownMenuItem>
      <Archive className="mr-2 h-4 w-4" />
      Archive Patient
      
    </DropdownMenuItem>
    {editingVisitId && (
  <>
    <DropdownMenuSeparator />

    <DropdownMenuItem
      className="text-red-600"
      onClick={async () => {
        const confirmed = window.confirm(
          "Delete this visit permanently?"
        );

        if (!confirmed) return;

        const { error } = await apiClient
          .from("visits")
          .delete()
          .eq("id", editingVisitId);

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Visit deleted");

        setVisits(prev =>
          prev.filter(v => v.id !== editingVisitId)
        );

        setEditingVisitId(null);
        setForm(emptyVisitForm());
      }}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Delete Visit
    </DropdownMenuItem>
  </>
)}

    {(role === "admin" ||
      role === "super_admin") && (
      <>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-red-600"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Patient
        </DropdownMenuItem>
      </>
    )}
  </DropdownMenuContent>
</DropdownMenu>
          </div>
        </div>
      </div>

      {isHmo && cid && (
        <div className="mb-5">
          <HMOVerificationCard
            patientId={patient.id}
            clinicId={cid}
            hmoId={patient.active_hmo_id}
            hmoName={hmoName}
            hmoWebsite={hmoWebsite}
            enrolleeNumber={patient.enrollee_number}
            status={((patient as any).hmo_verification_status as HmoVerifStatus) || "pending"}
            verifiedAt={(patient as any).hmo_verified_at}
            notes={(patient as any).hmo_verification_notes}
            onUpdated={(next) => setPatient(p => p ? ({
              ...p,
              hmo_verification_status: next.status,
              hmo_verified_at: next.verifiedAt,
              hmo_verification_notes: next.notes,
            } as any) : p)}
          />
        </div>
      )}


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
          <>
              <div className="space-y-1"><Label className="text-xs">HMO Provider</Label>
                <Select value={editForm.active_hmo_id || ""} onValueChange={v => setEditForm(f => ({ ...f, active_hmo_id: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select HMO" /></SelectTrigger>
                  <SelectContent>{hmos.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
          
              <div className="space-y-1">
  <Label className="text-xs">
    Using another person's HMO?
  </Label>

  <Select
    value={
      editForm.hmo_coverage_type ||
      "principal"
    }
    onValueChange={v =>
      setEditForm(f => ({
        ...f,
        hmo_coverage_type: v,
      }))
    }
  >
    <SelectTrigger className="rounded-xl">
      <SelectValue />
    </SelectTrigger>

    <SelectContent>
      <SelectItem value="principal">
        No
      </SelectItem>

      <SelectItem value="dependent">
        Yes
      </SelectItem>
    </SelectContent>
  </Select>
</div>
{editForm.hmo_coverage_type === "dependent" && (
  <>
    <div className="space-y-1">
      <Label className="text-xs">
        Principal Name
      </Label>

      <Input
        className="rounded-xl"
        value={editForm.hmo_principal_name || ""}
        onChange={e =>
          setEditForm(f => ({
            ...f,
            hmo_principal_name: e.target.value,
          }))
        }
      />
    </div>

    <div className="space-y-1">
      <Label className="text-xs">
        Relationship
      </Label>

      <Input
        className="rounded-xl"
        value={editForm.hmo_relationship || ""}
        onChange={e =>
          setEditForm(f => ({
            ...f,
            hmo_relationship: e.target.value,
          }))
        }
      />
    </div>
  </>
)}
       </>
          
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" className="rounded-xl" onClick={handleEditPatient}>Save</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {editingVisitId && (
  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="font-semibold text-amber-900">
        Editing Visit •{" "}
        {new Date(
          visits.find(v => v.id === editingVisitId)?.created_at || ""
        ).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      <p className="text-sm text-amber-700">
        Changes will update the existing visit record.
      </p>
    </div>

    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        setEditingVisitId(null);
        setForm(emptyVisitForm());
      }}
    >
      Cancel
    </Button>
  </div>
</div>
)}

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList
className="
sticky
top-14
z-30
w-full
flex
overflow-x-auto
rounded-2xl
border
bg-background/95
backdrop-blur
p-1
shadow-sm
"
>
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
              <div className="space-y-1 sm:col-span-2">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">Chief Complaint</Label>

    <QuickPicker
      options={CHIEF_COMPLAINT_OPTIONS}
      multi
      searchable
      triggerLabel="+ Quick Phrases"
      currentValue={form.chiefComplaint}
      onSelect={v => setField("chiefComplaint", v)}
      popoverWidthClassName="w-72"
      align="end"
    />
  </div>

  <Textarea
    className="rounded-xl"
    value={form.chiefComplaint}
    onChange={e => setField("chiefComplaint", e.target.value)}
    rows={2}
  />

  <PickerChips
    value={form.chiefComplaint}
    onChange={v => setField("chiefComplaint", v)}
  />
</div>
              <div className="space-y-1 sm:col-span-2">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">
      History (ocular, medical, family)
    </Label>

    <QuickPicker
      options={HISTORY_OPTIONS}
      multi
      searchable
      triggerLabel="+ Quick Phrases"
      currentValue={form.history}
      onSelect={v => setField("history", v)}
      popoverWidthClassName="w-72"
      align="end"
    />
  </div>

  <Textarea
    className="rounded-xl"
    value={form.history}
    onChange={e => setField("history", e.target.value)}
    rows={3}
  />

  <PickerChips
    value={form.history}
    onChange={v => setField("history", v)}
  />
</div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Old Lens Prescription</Label><Textarea className="rounded-xl" value={form.oldLensPrescription} onChange={e => setField("oldLensPrescription", e.target.value)} rows={2} placeholder="e.g. OD -2.00/-0.50x180  OS -1.75/-0.75x10" /></div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="va" className="space-y-4">
          {(() => {
            const vaCell = (field: keyof ReturnType<typeof emptyVisitForm>, near = false, placeholder = "6/6") => (
              <div className="space-y-1" key={field as string}>
                <div className="flex items-center gap-1 min-w-0">
                  <Input
                    className="rounded-xl text-center flex-1 min-w-[56px] text-sm px-2"
                    value={(form as any)[field] || ""}
                    onChange={e => setField(field as string, e.target.value)}
                    placeholder={placeholder}
                    aria-label={field as string}
                  />
                  <QuickPicker
                    options={near ? VA_NEAR_OPTIONS : VA_DISTANCE_OPTIONS}
                    triggerLabel="VA"
                    currentValue={(form as any)[field] || ""}
                    onSelect={v => setField(field as string, v)}
                    popoverWidthClassName="w-44"
                  />
                </div>
              </div>
            );
            return (
              <>
                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity — Unaided</h2>
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <div />
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold">OD</Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold">OS</Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold">OU</Label>

                    <Label className="text-xs flex items-center font-semibold">Distance</Label>
                    {vaCell("vaUnaidedOd")}
                    {vaCell("vaUnaidedOs")}
                    {vaCell("vaUnaidedOu")}

                    <Label className="text-xs flex items-center font-semibold">Pinhole</Label>
                    {vaCell("vaUnaidedOdPh")}
                    {vaCell("vaUnaidedOsPh")}
                    <div />

                    <Label className="text-xs flex items-center font-semibold">Near VA (OU)</Label>
                    <div className="col-span-3">{vaCell("vaUnaidedNearOu", true, "N6")}</div>
                  </div>
                </div>

                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity — Aided</h2>
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <div />
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OD</AbbrTip></Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OS</AbbrTip></Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OU</AbbrTip></Label>

                    <Label className="text-xs flex items-center font-semibold">Distance</Label>
                    {vaCell("vaAidedOd")}
                    {vaCell("vaAidedOs")}
                    {vaCell("vaAidedOu")}

                    <Label className="text-xs flex items-center font-semibold">Near VA (OU)</Label>
                    <div className="col-span-3">{vaCell("vaAidedNearOu", true, "N6")}</div>
                  </div>
                </div>
              </>
            );
          })()}
        </TabsContent>


        <TabsContent value="refraction" className="space-y-4">
          {(() => {
            type Kind = "sphere" | "cyl" | "axis" | "add";
            const optsFor = (k: Kind) =>
              k === "sphere" ? SPHERE_OPTIONS :
              k === "cyl" ? CYL_OPTIONS :
              k === "axis" ? AXIS_OPTIONS :
              ADD_OPTIONS;

            const powerCell = (field: keyof ReturnType<typeof emptyVisitForm>, kind: Kind, placeholder: string) => (
              <div className="flex items-center gap-0.5" key={field as string}>
                <Input
                  className="rounded-xl text-center flex-1 min-w-[64px] text-sm px-2"
                  value={(form as any)[field] || ""}
                  onChange={e => setField(field as string, e.target.value)}
                  placeholder={placeholder}
                  aria-label={field as string}
                />
                <QuickPicker
                  options={optsFor(kind)}
                  searchable
                  triggerLabel="▾"
                  triggerClassName="px-1 h-9"
                  currentValue={(form as any)[field] || ""}
                  onSelect={v => setField(field as string, v)}
                  popoverWidthClassName="w-40"
                />
              </div>
            );
            const vaInline = (field: string, near = false) => (
              <div className="flex items-center gap-0.5">
                <Input
                  className="rounded-xl text-center flex-1 min-w-[64px] text-sm px-2"
                  value={(form as any)[field] || ""}
                  onChange={e => setField(field, e.target.value)}
                  placeholder={near ? "N6" : "6/6"}
                  aria-label={field}
                />
                <QuickPicker
                  options={near ? VA_NEAR_OPTIONS : VA_DISTANCE_OPTIONS}
                  triggerLabel="▾"
                  triggerClassName="px-1 h-9"
                  currentValue={(form as any)[field] || ""}
                  onSelect={v => setField(field, v)}
                  popoverWidthClassName="w-40"
                />
              </div>
            );

            return (
              <>
                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Auto Refraction</h2>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <div />
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OD</AbbrTip></Label>
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OS</AbbrTip></Label>

                    <Label className="text-xs font-semibold"><AbbrTip term="Sphere">Sphere</AbbrTip></Label>
{powerCell("autoOdSphere", "sphere", "-1.00")}
{powerCell("autoOsSphere", "sphere", "-1.00")}

<Label className="text-xs font-semibold"><AbbrTip term="Cyl">Cyl</AbbrTip></Label>
{powerCell("autoOdCyl", "cyl", "-0.50")}
{powerCell("autoOsCyl", "cyl", "-0.50")}

<Label className="text-xs font-semibold"><AbbrTip term="Axis">Axis</AbbrTip></Label>
{powerCell("autoOdAxis", "axis", "180")}
{powerCell("autoOsAxis", "axis", "180")}

<Label className="text-xs font-semibold"><AbbrTip term="VA">VA</AbbrTip></Label>
{vaInline("autoVaOd")}
{vaInline("autoVaOs")}
                </div>
                </div>
                
                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Subjective Refraction</h2>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    
                  <div />
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OD</AbbrTip></Label>
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OS</AbbrTip></Label>
                    <Label className="text-xs font-semibold"><AbbrTip term="Sphere">Sphere</AbbrTip></Label>
{powerCell("subOdSphere", "sphere", "-1.00")}
{powerCell("subOsSphere", "sphere", "-1.00")}

<Label className="text-xs font-semibold"><AbbrTip term="Cyl">Cyl</AbbrTip></Label>
{powerCell("subOdCyl", "cyl", "-0.50")}
{powerCell("subOsCyl", "cyl", "-0.50")}

<Label className="text-xs font-semibold"><AbbrTip term="Axis">Axis</AbbrTip></Label>
{powerCell("subOdAxis", "axis", "180")}
{powerCell("subOsAxis", "axis", "180")}

<Label className="text-xs font-semibold"><AbbrTip term="VA">VA</AbbrTip></Label>
{vaInline("subVaOd")}
{vaInline("subVaOs")}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Reading ADD</Label>
                      <div className="flex items-center gap-1">
                        <Input className="rounded-xl flex-1" value={form.subReadingAdd} onChange={e => setField("subReadingAdd", e.target.value)} placeholder="+1.50" />
                        <QuickPicker options={ADD_OPTIONS} searchable triggerLabel="▾" onSelect={v => setField("subReadingAdd", v)} popoverWidthClassName="w-40" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">VA Outcome (Near)</Label>
                      {vaInline("subVaOutcome", true)}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </TabsContent>



        <TabsContent value="exam" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Gauge size={16} /> Examination</h2>
            <div className="space-y-3">
              <div className="space-y-1">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">Examination findings</Label>

    <QuickPicker
      options={EXAM_OPTIONS}
      multi
      searchable
      triggerLabel="+ Quick Phrases"
      currentValue={form.examination}
      onSelect={v => setField("examination", v)}
      popoverWidthClassName="w-72"
      align="end"
    />
  </div>

  <Textarea
    className="rounded-xl"
    value={form.examination}
    onChange={e => setField("examination", e.target.value)}
    rows={4}
    placeholder="External, anterior segment, posterior segment..."
  />

  <PickerChips
    value={form.examination}
    onChange={v => setField("examination", v)}
  />
</div>
              <div className="space-y-3">
                <div className="space-y-1 max-w-xs">
                  <Label className="text-xs">IOP — Time</Label>
                  <Input className="rounded-xl" type="time" value={form.iopTime} onChange={e => setField("iopTime", e.target.value)} aria-label="IOP time (shared)" />
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
            <h2 className="section-title text-sm"><Stethoscope size={16} /> Diagnosis & Management</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-xs">Diagnosis</Label>
                  <div className="flex items-center gap-1">
                    <QuickPicker
                      options={REFRACTIVE_ERROR_OPTIONS}
                      multi
                      triggerLabel="+ Refractive Error"
                      currentValue={form.diagnosis}
                      onSelect={merged => setField("diagnosis", merged)}
                      popoverWidthClassName="w-64"
                      align="end"
                    />
                    <QuickPicker
                      options={DIAGNOSIS_GROUPS}
                      multi
                      searchable
                      triggerLabel="+ Diagnosis"
                      currentValue={form.diagnosis}
                      onSelect={merged => setField("diagnosis", merged)}
                      popoverWidthClassName="w-72"
                      align="end"
                    />
                  </div>
                </div>
                <Textarea className="rounded-xl" value={form.diagnosis} onChange={e => setField("diagnosis", e.target.value)} rows={3} />
                <PickerChips value={form.diagnosis} onChange={v => setField("diagnosis", v)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-xs">Treatment Plan</Label>
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <QuickPicker
                      options={LENS_RECOMMENDATION_OPTIONS}
                      multi
                      searchable
                      triggerLabel="+ Glasses / Lens"
                      currentValue={form.lensType}
                      onSelect={v => setField("lensType", v)}
                      popoverWidthClassName="w-72"
                      align="end"
                    />
                    <MedicationPicker
                      items={medications}
                      onAdd={line => setField("medication", line)}
                      triggerLabel="+ Medication"
                    />
                  </div>
                </div>
                <Textarea
                className="rounded-xl"
                value={form.lensType}
                onChange={e => setField("lensType", e.target.value)}
                rows={2}
              />
                <Textarea
  className="rounded-xl mt-2"
  value={form.medication}
  onChange={e => setField("medication", e.target.value)}
  rows={2}
  placeholder="Medication"
/>
              </div>


              <div className="space-y-1">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">Notes / Advice / Referral</Label>

    <div className="flex items-center gap-1">
      <QuickPicker
        options={ADVICE_OPTIONS}
        multi
        triggerLabel="+ Advice"
        currentValue={form.notes}
        onSelect={merged => setField("notes", merged)}
        popoverWidthClassName="w-64"
        align="end"
      />

      <QuickPicker
        options={REFERRAL_OPTIONS}
        multi
        triggerLabel="+ Referral"
        currentValue={form.notes}
        onSelect={merged => setField("notes", merged)}
        popoverWidthClassName="w-64"
        align="end"
      />
    </div>
  </div>

  <Textarea
    className="rounded-xl"
    value={form.notes}
    onChange={e => setField("notes", e.target.value)}
    rows={3}
  />

  <PickerChips
    value={form.notes}
    onChange={v => setField("notes", v)}
  />
</div>

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
                  <div key={v.id} className="relative pl-8 pb-6">

  <div className="absolute left-3 top-2 h-4 w-4 rounded-full bg-primary" />

  <div className="absolute left-5 top-6 bottom-0 w-px bg-border" />

  <div
  className="
  rounded-3xl
  border
  bg-card
  p-4
  shadow-sm
  hover:shadow-md
  transition-all
  duration-200
  "
>

    <div className="flex items-center justify-between">

      <div>
        <p className="font-bold text-base">
  {new Date(v.created_at).toLocaleDateString()}
</p>

        {v.diagnosis && (
  <div className="mt-1">
    <span
      className="
      inline-flex
      px-2
      py-1
      rounded-full
      text-[11px]
      bg-primary/10
      text-primary
      "
    >
      {v.diagnosis}
    </span>
  </div>
)}
      </div>

      <span
  className={`text-[11px] px-3 py-1 rounded-full font-medium ${
    v.status === "completed"
      ? "bg-green-100 text-green-700"
      : "bg-amber-100 text-amber-700"
  }`}
>
  {v.status === "completed"
    ? "Completed"
    : "Open"}
</span>

    </div>

    <pre className="text-[10px] overflow-auto">
      </pre>
  
    <div className="mt-3 text-xs space-y-2">

  {v.chief_complaint && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-sky-600">
  <ClipboardList size={14} />
  CC
</div> {v.chief_complaint}
    </p>
  )}

  {v.history && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-amber-600">
  <History size={14} />
  History
</div> {v.history}
    </p>
  )}

  {(v.va_unaided_od || v.va_unaided_os) && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-indigo-600">
  <Eye size={14} />
  Visual Acuity
</div>
      {" "}
      UA OD: {v.va_unaided_od || "—"}
      {" | "}
      UA OS: {v.va_unaided_os || "—"}
    </p>
  )}

  {(v.iop_od || v.iop_os) && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-red-500">
  <Gauge size={14} />
  IOP
</div>
      {" "}
      OD {v.iop_od || "—"} mmHg
      {" | "}
      OS {v.iop_os || "—"} mmHg
    </p>
  )}

  {v.examination && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-sky-600">
  <Eye size={14} />
  Examination
</div>
      {" "}
      {v.examination}
    </p>
  )}

  {v.diagnosis && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-red-500">
  <Stethoscope size={14} />
  Diagnosis
</div>
      {" "}
      {v.diagnosis}
    </p>
  )}

  {(
  v.sub_od_sphere ||
  v.sub_od_cyl ||
  v.sub_od_axis ||
  v.sub_os_sphere ||
  v.sub_os_cyl ||
  v.sub_os_axis ||
  v.sub_reading_add
) && (
    <div className="rounded-xl bg-primary/5 p-3">
      <div className="flex items-center gap-2 font-medium text-indigo-600 mb-2">
  <Eye size={14} />
  Subjective Refraction
</div>

      <p>
  OD: {v.sub_od_sphere ?? "Plano"}
  {" / "}
  {v.sub_od_cyl ?? "0.00"}
  {" × "}
  {v.sub_od_axis ?? "—"}
</p>

<p>
  OS: {v.sub_os_sphere ?? "Plano"}
  {" / "}
  {v.sub_os_cyl ?? "0.00"}
  {" × "}
  {v.sub_os_axis ?? "—"}
</p>

      {v.sub_reading_add && (
        <p>
          ADD: {v.sub_reading_add}
        </p>
      )}
    </div>
  )}

  {(v.lens_type || v.medication || v.notes) && (
    <div>
      <div className="flex items-center gap-2 font-semibold text-green-600">
  <FileText size={14} />
  Management Plan
</div>

      {v.lens_type && (
        <p>• {v.lens_type}</p>
      )}

      {v.medication && (
        <p>• {v.medication}</p>
      )}

      {v.notes && (
        <p>• {v.notes}</p>
      )}
    </div>
  )}

</div>

    <div className="mt-3 flex gap-2">
  <Button
    size="sm"
    variant="outline"
    className="rounded-xl"
    onClick={() => startEditVisit(v)}
  >
    Edit
  </Button>

  <Button
    size="sm"
    variant="outline"
    className="rounded-xl"
    onClick={() => generateVisitPdf(patient, v)}
  >
    Export
  </Button>
</div>

  </div>

</div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-20 lg:bottom-4 mt-6 flex justify-end gap-2">
        
      {editingVisitId ? (
  <>
    <Button
      variant="destructive"
      size="lg"
      className="rounded-2xl"
      onClick={async () => {
        const confirmed = window.confirm(
          "Delete this visit permanently?"
        );

        if (!confirmed) return;

        const { error } = await apiClient
          .from("visits")
          .delete()
          .eq("id", editingVisitId);

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Visit deleted");

        setVisits(prev =>
          prev.filter(v => v.id !== editingVisitId)
        );

        setEditingVisitId(null);
        setForm(emptyVisitForm());
      }}
      >
        Delete Visit
      </Button>

      <Button
        size="lg"
        className="shadow-lg rounded-2xl px-6"
        onClick={() => handleSaveVisit(true)}
        disabled={saving}
      >
        <Pencil size={16} className="mr-1" />
        Update Visit
      </Button>
    </>
  ) : (
    <>

      <Button
        onClick={() => handleSaveVisit(true)}
        size="lg"
        className="shadow-lg rounded-2xl px-6"
        disabled={saving}
      >
        <CheckCircle2 size={16} className="mr-1" />
        Complete Visit
      </Button>
    </>
  )}
        
</div>
    </>
  );
}
