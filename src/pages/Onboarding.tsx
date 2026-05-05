import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClinic } from "@/hooks/useClinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CheckCircle2, ArrowRight, Eye, Stethoscope, Pill, FlaskConical, Sparkles } from "lucide-react";

const CLINIC_TYPES = [
  { id: "eye_clinic", label: "Eye Clinic", desc: "Refraction, glaucoma, cataract", icon: Eye },
  { id: "general_hospital", label: "General Hospital", desc: "Consultations, inpatient, lab", icon: Stethoscope },
  { id: "pharmacy", label: "Pharmacy", desc: "Inventory & sales", icon: Pill },
  { id: "diagnostic_lab", label: "Diagnostic Lab", desc: "Tests & reports", icon: FlaskConical },
];

const STEP_LABELS = ["Welcome", "Confirm", "Type", "Modules", "Staff", "First patient", "Done"];

export default function Onboarding() {
  const navigate = useNavigate();
  const { clinic, profile, trialDaysLeft, loading, reload } = useClinic();
  const [step, setStep] = useState(0);
  const [clinicType, setClinicType] = useState("eye_clinic");
  const [modules, setModules] = useState({ billing: true, hmo: true, pharmacy: true, appointments: true });
  const [staff, setStaff] = useState({ doctor_name: "", doctor_email: "", reception_name: "", reception_email: "" });
  const [patient, setPatient] = useState({ full_name: "", phone: "", age: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && clinic?.setup_completed) navigate("/", { replace: true });
  }, [loading, clinic, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading user session…</div>;
  }
  if (!clinic) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-lg font-semibold">No clinic linked to your account</h1>
          <p className="text-sm text-muted-foreground">Contact your administrator or sign in with the correct account.</p>
          <Button variant="outline" onClick={() => navigate("/login")}>Back to login</Button>
        </div>
      </div>
    );
  }

  const next = () => setStep(s => Math.min(s + 1, STEP_LABELS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const initType = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("smart_initialize_clinic", { _clinic_id: clinic.id, _clinic_type: clinicType });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Clinic initialized");
    next();
  };

  const saveModules = async () => {
    setBusy(true);
    const { error } = await supabase.from("clinic_feature_flags").upsert({
      clinic_id: clinic.id,
      billing_enabled: modules.billing,
      hmo_enabled: modules.hmo,
      pharmacy_enabled: modules.pharmacy,
      appointments_enabled: modules.appointments,
      inventory_enabled: true,
    } as any, { onConflict: "clinic_id" } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    next();
  };

  const saveStaff = async () => {
    // Lightweight: just create invites entries; actual user creation happens via super-admin or invite flow
    setBusy(true);
    const rows: any[] = [];
    if (staff.doctor_email) rows.push({ clinic_id: clinic.id, email: staff.doctor_email, role: "doctor" });
    if (staff.reception_email) rows.push({ clinic_id: clinic.id, email: staff.reception_email, role: "receptionist" });
    if (rows.length) {
      const { error } = await supabase.from("invites").insert(rows);
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    await supabase.from("clinics").update({ staff_setup_done: true, staff_added: true }).eq("id", clinic.id);
    setBusy(false);
    next();
  };

  const savePatient = async () => {
    setBusy(true);
    if (patient.full_name.trim()) {
      const { error } = await supabase.from("patients").insert({
        clinic_id: clinic.id,
        full_name: patient.full_name.trim(),
        phone: patient.phone || "",
        age: patient.age ? parseInt(patient.age) : null,
      } as any);
      if (error) { setBusy(false); toast.error(error.message); return; }
      await supabase.from("clinics").update({ first_patient_done: true, first_patient_created: true }).eq("id", clinic.id);
    }
    setBusy(false);
    next();
  };

  const finish = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("complete_onboarding", { _clinic_id: clinic.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Setup complete!");
    await reload();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 lg:p-8">
        {/* Stepper */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto">
          {STEP_LABELS.map((lbl, i) => (
            <div key={lbl} className="flex items-center gap-1 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                i < step ? "bg-primary text-primary-foreground"
                : i === step ? "bg-primary/20 text-primary border border-primary"
                : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              {i < STEP_LABELS.length - 1 && <div className={`w-6 h-0.5 ${i < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="form-section space-y-6">
          {step === 0 && (
            <div className="text-center space-y-3 py-6">
              <Sparkles className="mx-auto text-primary" size={40} />
              <h1 className="text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}!</h1>
              <p className="text-muted-foreground">Let's get <strong>{clinic.name}</strong> set up in a few quick steps.</p>
              <Button onClick={next} className="mt-4">Get Started <ArrowRight size={16} className="ml-1" /></Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Your Clinic</h2>
              <div className="rounded-xl border p-4 bg-muted/30">
                <div className="text-xs uppercase text-muted-foreground">Clinic name</div>
                <div className="text-lg font-semibold">{clinic.name}</div>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
                You have <strong>{Number.isFinite(trialDaysLeft) ? trialDaysLeft : "∞"}</strong> days left on your free trial.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={back}>Back</Button>
                <Button onClick={next} className="flex-1">Continue</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">What type of clinic?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CLINIC_TYPES.map(t => {
                  const Icon = t.icon;
                  const active = clinicType === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setClinicType(t.id)}
                      className={`text-left p-4 rounded-2xl border transition-all ${
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}>
                      <Icon className={active ? "text-primary" : "text-muted-foreground"} size={22} />
                      <div className="font-semibold mt-2">{t.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={back}>Back</Button>
                <Button onClick={initType} className="flex-1" disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Enable modules</h2>
              {(["billing", "hmo", "pharmacy", "appointments"] as const).map(k => (
                <div key={k} className="flex items-center justify-between rounded-xl border p-3">
                  <div className="capitalize font-medium">{k}</div>
                  <Switch checked={modules[k]} onCheckedChange={(v) => setModules(m => ({ ...m, [k]: v }))} />
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" onClick={back}>Back</Button>
                <Button onClick={saveModules} className="flex-1" disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Add staff (optional)</h2>
              <p className="text-sm text-muted-foreground">We'll create invites — they receive setup links separately.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Doctor name</Label><Input value={staff.doctor_name} onChange={e => setStaff(s => ({ ...s, doctor_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Doctor email</Label><Input type="email" value={staff.doctor_email} onChange={e => setStaff(s => ({ ...s, doctor_email: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Reception name</Label><Input value={staff.reception_name} onChange={e => setStaff(s => ({ ...s, reception_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Reception email</Label><Input type="email" value={staff.reception_email} onChange={e => setStaff(s => ({ ...s, reception_email: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={back}>Back</Button>
                <Button variant="ghost" onClick={next}>Skip</Button>
                <Button onClick={saveStaff} className="flex-1" disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Add your first patient (optional)</h2>
              <div className="space-y-1.5"><Label>Full name</Label><Input value={patient.full_name} onChange={e => setPatient(p => ({ ...p, full_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Phone</Label><Input value={patient.phone} onChange={e => setPatient(p => ({ ...p, phone: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Age</Label><Input type="number" value={patient.age} onChange={e => setPatient(p => ({ ...p, age: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={back}>Back</Button>
                <Button variant="ghost" onClick={next}>Skip</Button>
                <Button onClick={savePatient} className="flex-1" disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="text-center space-y-4 py-6">
              <CheckCircle2 className="mx-auto text-primary" size={48} />
              <h2 className="text-2xl font-bold">You're all set!</h2>
              <p className="text-muted-foreground">{clinic.name} is ready to use.</p>
              <Button onClick={finish} disabled={busy} size="lg">{busy ? "Finishing…" : "Go to Dashboard"}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
