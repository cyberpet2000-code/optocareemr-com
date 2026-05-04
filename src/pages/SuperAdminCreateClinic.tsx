import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, ArrowLeft } from "lucide-react";

export default function SuperAdminCreateClinic() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    clinic_name: "",
    admin_full_name: "",
    admin_email: "",
    admin_password: "",
    phone: "",
  });

  if (roleLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isSuperAdmin) {
    return <div className="p-6 text-sm text-destructive">Super admin access required.</div>;
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-clinic", { body: form });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to create clinic");
      return;
    }
    toast.success("Clinic created successfully and is now in trial mode");
    navigate("/super-admin/clinics");
  };

  return (
    <div className="max-w-xl mx-auto p-4 lg:p-6 space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground inline-flex items-center gap-1.5 hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Building2 size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Create Clinic</h1>
          <p className="text-sm text-muted-foreground">Provision a new clinic with admin access (14-day trial)</p>
        </div>
      </div>

      <form onSubmit={submit} className="form-section space-y-4">
        <div className="space-y-1.5">
          <Label>Clinic Name *</Label>
          <Input required value={form.clinic_name} onChange={e => set("clinic_name", e.target.value)} maxLength={120} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Admin Full Name *</Label>
            <Input required value={form.admin_full_name} onChange={e => set("admin_full_name", e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone (optional)</Label>
            <Input value={form.phone} onChange={e => set("phone", e.target.value)} maxLength={32} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Admin Email *</Label>
          <Input type="email" required value={form.admin_email} onChange={e => set("admin_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Admin Password *</Label>
          <Input type="password" required minLength={8} value={form.admin_password} onChange={e => set("admin_password", e.target.value)} />
          <p className="text-xs text-muted-foreground">Minimum 8 characters. Share securely with the admin.</p>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating clinic..." : "Create Clinic"}
        </Button>
      </form>
    </div>
  );
}
