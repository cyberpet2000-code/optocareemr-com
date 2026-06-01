import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAccess } from "@/hooks/useAccess";

export default function PatientRegister() {
  const navigate = useNavigate();
  const { effectiveClinicId: cid } = useAccess();
  const [loading, setLoading] = useState(false);
  const [hmos, setHmos] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    fullName: "", age: "", gender: "", phone: "",
    address: "", nextOfKin: "",
    
    paymentType: "private" as "private" | "hmo",
    
    activeHmoId: "", 
    enrolleeNumber: "",
    hmoCoverageType: "principal" as "principal" | "dependent",
  hmoPrincipalName: "",
  hmoRelationship: "",

  priority: "normal" as "normal" | "follow_up" | "emergency",
});

  useEffect(() => {
    if (!cid) return;
    apiClient.from("hmos").select("id, name").eq("clinic_id", cid).eq("status", "active").order("name").then(({ data }) => {
      if (data) setHmos(data as any);
    });
  }, [cid]);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.age || !form.gender) {
      toast.error("Fill required fields (Name, Age, Gender)");
      return;
    }
    if (form.paymentType === "hmo" && !form.activeHmoId) {
      toast.error("Select HMO provider");
      return;
    }
    if (
  form.paymentType === "hmo" &&
  form.hmoCoverageType === "dependent" &&
  !form.hmoPrincipalName.trim()
) {
  toast.error("Enter principal name");
  return;
    }
    if (!cid) { toast.error("No active clinic"); return; }
    setLoading(true);
    const { data, error } = await apiClient.from("patients").insert({
      clinic_id: cid,
      full_name: form.fullName.trim(),
      age: parseInt(form.age),
      gender: form.gender,
      phone: form.phone.trim(),
      address: form.address.trim(),
      next_of_kin: form.nextOfKin.trim(),
      payment_type: form.paymentType,
      active_hmo_id: form.paymentType === "hmo" ? form.activeHmoId : null,
      enrollee_number: form.paymentType === "hmo" ? form.enrolleeNumber.trim() : "",
      hmo_coverage_type:
  form.paymentType === "hmo"
    ? form.hmoCoverageType
    : null,

hmo_principal_name:
  form.paymentType === "hmo" &&
  form.hmoCoverageType === "dependent"
    ? form.hmoPrincipalName.trim()
    : null,

hmo_relationship:
  form.paymentType === "hmo" &&
  form.hmoCoverageType === "dependent"
    ? form.hmoRelationship
    : null,
      priority: form.priority,
      queue_status: "waiting",
    } as any).select().single();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient registered");
    navigate(`/patient/${data!.id}`);
  };

  return (
    <>
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
          <div className="space-y-1"><Label className="text-xs">Payment Type *</Label>
            <Select value={form.paymentType} onValueChange={v => set("paymentType", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private (Self-pay)</SelectItem>
                <SelectItem value="hmo">HMO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Priority</Label>
            <Select value={form.priority} onValueChange={v => set("priority", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.paymentType === "hmo" && (
            <>
              <div className="space-y-1"><Label className="text-xs">HMO Provider *</Label>
                <Select value={form.activeHmoId} onValueChange={v => set("activeHmoId", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select HMO" /></SelectTrigger>
                  <SelectContent>
                    {hmos.length === 0
                      ? <SelectItem value="__none__" disabled>No HMOs configured</SelectItem>
                      : hmos.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
             <div className="space-y-1"><Label className="text-xs">Enrollee Number</Label><Input className="rounded-xl" value={form.enrolleeNumber} onChange={e => set("enrolleeNumber", e.target.value)} /></div>
              <div className="space-y-1">
  <Label className="text-xs">
  Using another person's HMO?
</Label>

  <Select
    value={form.hmoCoverageType}
    onValueChange={v => set("hmoCoverageType", v)}
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

{form.hmoCoverageType === "dependent" && (
  <>
    <div className="space-y-1">
      <Label className="text-xs">
        Principal Name
      </Label>

      <Input
        className="rounded-xl"
        value={form.hmoPrincipalName}
        onChange={e =>
          set("hmoPrincipalName", e.target.value)
        }
      />
    </div>

    <div className="space-y-1">
      <Label className="text-xs">
        Relationship
      </Label>

      <Select
        value={form.hmoRelationship}
        onValueChange={v =>
          set("hmoRelationship", v)
        }
      >
        <SelectTrigger className="rounded-xl">
          <SelectValue placeholder="Select" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="spouse">
            Spouse
          </SelectItem>
          <SelectItem value="child">
            Child
          </SelectItem>
          <SelectItem value="parent">
            Parent
          </SelectItem>
          <SelectItem value="sibling">
            Sibling
          </SelectItem>
          <SelectItem value="other">
            Other
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </>
)}
            </>
      
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" className="rounded-xl" disabled={loading}>{loading ? "Saving..." : "Register"}</Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate("/")}>Cancel</Button>
        </div>
      </form>
    </>
  );
}
