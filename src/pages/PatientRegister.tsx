import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const HMO_LIST = [
  "Leadway Health", "Hygeia HMO", "AXA Mansard", "Reliance HMO",
  "Clearline HMO", "Total Health Trust", "Redcare HMO", "Mediplan",
  "Princeton HMO", "Novo Health", "Venus Medicare", "Zuma Health",
];

export default function PatientRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "", age: "", gender: "", phone: "",
    address: "", nextOfKin: "",
    patientType: "Private" as "Private" | "HMO",
    hmoProvider: "", enrolleeNumber: "",
  });

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.age || !form.gender) {
      toast.error("Fill required fields (Name, Age, Gender)");
      return;
    }
    if (form.patientType === "HMO" && !form.hmoProvider) {
      toast.error("Select HMO provider");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("patients").insert({
      full_name: form.fullName.trim(),
      age: parseInt(form.age), gender: form.gender,
      phone: form.phone.trim(), address: form.address.trim(),
      next_of_kin: form.nextOfKin.trim(), patient_type: form.patientType,
      hmo_provider: form.patientType === "HMO" ? form.hmoProvider : "",
      insurance_name: form.patientType === "HMO" ? form.hmoProvider : "",
      enrollee_number: form.patientType === "HMO" ? form.enrolleeNumber.trim() : "",
    }).select().single();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient registered");
    navigate(`/patient/${data.id}`);
  };

  return (
    <AppLayout>
      <h1 className="page-header mb-5">Register Patient</h1>
      <form onSubmit={handleSubmit} className="form-section max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Full Name *</Label><Input className="rounded-xl" value={form.fullName} onChange={e => set("fullName", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Age *</Label><Input className="rounded-xl" type="number" min={0} max={150} value={form.age} onChange={e => set("age", e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Gender *</Label>
              <Select value={form.gender} onValueChange={v => set("gender", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Phone</Label><Input className="rounded-xl" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Next of Kin</Label><Input className="rounded-xl" value={form.nextOfKin} onChange={e => set("nextOfKin", e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Address</Label><Textarea className="rounded-xl" value={form.address} onChange={e => set("address", e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label className="text-xs">Patient Type *</Label>
            <Select value={form.patientType} onValueChange={v => set("patientType", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Private">Private</SelectItem><SelectItem value="HMO">HMO</SelectItem></SelectContent>
            </Select>
          </div>
          {form.patientType === "HMO" && (
            <>
              <div className="space-y-1"><Label className="text-xs">HMO Provider *</Label>
                <Select value={form.hmoProvider} onValueChange={v => set("hmoProvider", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select HMO" /></SelectTrigger>
                  <SelectContent>{HMO_LIST.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Enrollee Number</Label><Input className="rounded-xl" value={form.enrolleeNumber} onChange={e => set("enrolleeNumber", e.target.value)} /></div>
            </>
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" className="rounded-xl" disabled={loading}>{loading ? "Saving..." : "Register"}</Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate("/")}>Cancel</Button>
        </div>
      </form>
    </AppLayout>
  );
}
