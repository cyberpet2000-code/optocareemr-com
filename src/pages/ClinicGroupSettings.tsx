import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAccessClinic, useAccessActions } from "@/hooks/useAccess";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";

type ClinicRow = { id: string; name: string; type: string | null; parent_clinic_id: string | null; is_active: boolean | null; setup_completed: boolean | null; phone: string | null; email: string | null };
type Entitlement = { plan_code: string; monthly_amount_ngn: number; annual_amount_ngn: number; branch_limit: number; staff_limit: number | null; provider_limit: number | null; analytics_level: string; ai_allowance: string };

export default function ClinicGroupSettings() {
  const { clinic, effectiveClinicId } = useAccessClinic();
  const { switchClinic } = useAccessActions();
  const { role } = useRole();
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, e] = await Promise.all([
        (apiClient as any).rpc("get_clinic_group_context"),
        (apiClient as any).rpc("get_clinic_entitlement", { p_clinic_id: effectiveClinicId || null }),
      ]);
      if (g.error) throw g.error; if (e.error) throw e.error;
      setClinics((g.data || []) as ClinicRow[]);
      setEntitlement((e.data?.[0] || null) as Entitlement | null);
    } catch (error: any) { toast.error(error?.message || "Unable to load clinic group"); }
    finally { setLoading(false); }
  }, [effectiveClinicId]);

  useEffect(() => { void load(); }, [load]);

  if (role !== "admin" && role !== "super_admin") {
    return <div className="form-section"><h1 className="text-xl font-semibold">Clinic Group</h1><p className="text-sm text-muted-foreground mt-2">Only clinic administrators can manage locations and group settings.</p></div>;
  }

  const branches = clinics.filter(c => c.parent_clinic_id);
  const limit = entitlement?.branch_limit ?? 0;
  const canAdd = limit === -1 || branches.length < limit;
  const multiClinic = entitlement?.plan_code === "clinic" || entitlement?.plan_code === "network";

  const createBranch = async () => {
    if (!name.trim()) return toast.error("Clinic location name is required");
    if (!multiClinic) return toast.error("Additional locations require the Clinic plan.");
    if (!canAdd) return toast.error("Your current plan has reached its location limit.");
    setCreating(true);
    try {
      const { data, error } = await (apiClient as any).rpc("create_clinic_branch", {
        p_name: name.trim(), p_address: address.trim() || null, p_phone: phone.trim() || null, p_email: email.trim().toLowerCase() || null,
      });
      if (error) throw error;
      toast.success("New clinic location created");
      setName(""); setAddress(""); setPhone(""); setEmail("");
      await load();
      if (data) await switchClinic(data);
    } catch (error: any) { toast.error(error?.message || "Unable to create clinic location"); }
    finally { setCreating(false); }
  };

  const enter = async (id: string) => {
    if (id === effectiveClinicId || switching) return;
    setSwitching(id);
    try { await switchClinic(id); toast.success("Clinic location selected"); }
    catch (error: any) { toast.error(error?.message || "Unable to switch clinic"); }
    finally { setSwitching(null); }
  };

  return <div className="space-y-6 max-w-5xl">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Clinic Group & Locations</h1><p className="text-sm text-muted-foreground mt-1">Manage your primary clinic and additional locations without mixing their patient, billing, inventory or clinical data.</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</Button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="form-section"><div className="text-xs text-muted-foreground uppercase tracking-wide">Plan</div><div className="text-lg font-semibold mt-1 capitalize">{entitlement?.plan_code || "—"}</div><div className="text-xs text-muted-foreground">Subscription controls location capacity.</div></div>
      <div className="form-section"><div className="text-xs text-muted-foreground uppercase tracking-wide">Locations</div><div className="text-lg font-semibold mt-1">{clinics.length || 1} / {limit === -1 ? "Unlimited" : Math.max(1, limit + 1)}</div><div className="text-xs text-muted-foreground">Primary clinic counts as location 1.</div></div>
      <div className="form-section"><div className="text-xs text-muted-foreground uppercase tracking-wide">Staff</div><div className="text-lg font-semibold mt-1">{entitlement?.staff_limit ?? "Custom"}</div><div className="text-xs text-muted-foreground">Per group plan limit.</div></div>
    </div>

    <div className="form-section space-y-4">
      <div className="flex items-center gap-2 font-semibold"><Building2 size={18} /> Locations</div>
      {loading ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline animate-spin mr-2" size={16} />Loading locations…</div> :
        <div className="space-y-2">{clinics.map(c => <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 bg-muted/20">
          <div><div className="flex items-center gap-2"><span className="font-semibold">{c.name}</span>{!c.parent_clinic_id ? <Badge variant="secondary">Primary / HQ</Badge> : <Badge variant="outline">Branch</Badge>}{c.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}</div><div className="text-xs text-muted-foreground mt-1">{c.email || c.phone || "No contact details configured"}</div></div>
          <Button size="sm" variant={c.id === effectiveClinicId ? "secondary" : "outline"} disabled={c.id === effectiveClinicId || !!switching} onClick={() => void enter(c.id)}>{switching === c.id ? <Loader2 size={14} className="animate-spin mr-1" /> : c.id === effectiveClinicId ? <CheckCircle2 size={14} className="mr-1" /> : null}{c.id === effectiveClinicId ? "Current" : "Enter clinic"}</Button>
        </div>)}</div>}
    </div>

    <div className="form-section space-y-4">
      <div><h2 className="font-semibold">Add a clinic location</h2><p className="text-sm text-muted-foreground mt-1">{multiClinic ? "The primary clinic counts as location 1. Add branches until your plan limit is reached." : "Additional locations become available on the Clinic plan."}</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Location name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. OptoCare Lekki" /></div>
        <div className="space-y-1.5"><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full clinic address" /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234..." /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="location@example.com" /></div>
      </div>
      <Button onClick={() => void createBranch()} disabled={creating || !multiClinic || !canAdd} className="gap-2">{creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{creating ? "Creating location…" : "Add clinic location"}</Button>
    </div>

    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><strong>Data separation:</strong> each location keeps its own patients, visits, billing, payments, inventory, HMO claims and daily operational records. HQ administrators can switch locations; branch staff remain restricted to their assigned location.</div>
  </div>;
}
