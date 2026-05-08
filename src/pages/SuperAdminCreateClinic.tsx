import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, ArrowLeft, MailCheck, Copy, Check } from "lucide-react";

export default function SuperAdminCreateClinic() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    clinic_name: "",
    admin_full_name: "",
    admin_email: "",
  });
  const [result, setResult] = useState<{
    clinic_name: string;
    invite_link: string;
    email_sent: boolean;
    email_error: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (roleLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isSuperAdmin) {
    return <div className="p-6 text-sm text-destructive">Super admin access required.</div>;
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-clinic", {
      body: { ...form, origin: window.location.origin },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to create clinic");
      return;
    }
    const d = data as any;
    setResult({
      clinic_name: d.clinic_name,
      invite_link: d.invite_link,
      email_sent: !!d.email_sent,
      email_error: d.email_error || null,
    });
    if (d.email_sent) {
      toast.success("Clinic created. Invite email sent to admin.");
    } else {
      toast.warning("Clinic created. Email could not be sent — share the invite link manually.");
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.invite_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy link");
    }
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
          <p className="text-sm text-muted-foreground">Provision a new clinic and invite its admin (14-day trial)</p>
        </div>
      </div>

      {!result ? (
        <form onSubmit={submit} className="form-section space-y-4">
          <div className="space-y-1.5">
            <Label>Clinic Name *</Label>
            <Input required value={form.clinic_name} onChange={e => set("clinic_name", e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Admin Full Name *</Label>
            <Input required value={form.admin_full_name} onChange={e => set("admin_full_name", e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Admin Email *</Label>
            <Input type="email" required value={form.admin_email} onChange={e => set("admin_email", e.target.value)} maxLength={160} />
          </div>
          <p className="text-xs text-muted-foreground">
            The admin will receive an email invitation to set their own password and join the clinic. No password is created here.
          </p>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating clinic..." : "Create Clinic & Send Invite"}
          </Button>
        </form>
      ) : (
        <div className="form-section space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <MailCheck size={20} />
            <h2 className="font-semibold">{result.clinic_name} created</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {result.email_sent
              ? "An invite email was sent to the admin. They'll set their password and be redirected to the clinic."
              : `Email could not be sent${result.email_error ? ` (${result.email_error})` : ""}. Share the invite link below manually.`}
          </p>
          <div className="space-y-1.5">
            <Label>Invite link</Label>
            <div className="flex items-stretch gap-2">
              <Input readOnly value={result.invite_link} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setResult(null); setForm({ clinic_name: "", admin_full_name: "", admin_email: "" }); }}>
              Create another
            </Button>
            <Button className="flex-1" onClick={() => navigate("/super-admin/clinics", { replace: true })}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
