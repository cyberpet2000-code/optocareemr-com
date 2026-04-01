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

export default function PatientRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "", age: "", gender: "", phone: "",
    address: "", nextOfKin: "", insuranceName: "", enrolleeNumber: "",
  });

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.age || !form.gender) {
      toast.error("Please fill in required fields (Name, Age, Gender)");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("Patients").insert({
      full_name: form.fullName.trim(),
      age: parseInt(form.age),
      gender: form.gender,
      phone: form.phone.trim(),
      address: form.address.trim(),
      next_of_kin: form.nextOfKin.trim(),
      insurance_name: form.insuranceName.trim(),
      enrollee_number: form.enrolleeNumber.trim(),
    } as any).select().single();
    setLoading(false);

    if (error) {
      toast.error("Failed to register patient: " + error.message);
      return;
    }
    toast.success("Patient registered successfully");
    navigate(`/patient/${(data as any).id}`);
  };

  return (
    <AppLayout>
      <h1 className="page-header mb-6">Register New Patient</h1>
      <form onSubmit={handleSubmit} className="form-section max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={form.fullName} onChange={e => set("fullName", e.target.value)} maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Age *</Label>
              <Input type="number" min={0} max={150} value={form.age} onChange={e => set("age", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gender *</Label>
              <Select value={form.gender} onValueChange={v => set("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <Input value={form.phone} onChange={e => set("phone", e.target.value)} maxLength={20} />
          </div>
          <div className="space-y-1.5">
            <Label>Next of Kin</Label>
            <Input value={form.nextOfKin} onChange={e => set("nextOfKin", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Textarea value={form.address} onChange={e => set("address", e.target.value)} rows={2} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label>Health Insurance Name</Label>
            <Input value={form.insuranceName} onChange={e => set("insuranceName", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label>Enrollee Number</Label>
            <Input value={form.enrolleeNumber} onChange={e => set("enrolleeNumber", e.target.value)} maxLength={50} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit">Register Patient</Button>
          <Button type="button" variant="outline" onClick={() => navigate("/")}>Cancel</Button>
        </div>
      </form>
    </AppLayout>
  );
}
