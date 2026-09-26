import OptoLoader from "@/components/OptoLoader";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Building2, Trash2, Pencil, FileText } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";
import { confirmDestructiveAction } from "@/lib/safeDelete";
import { secureOfflineGet, secureOfflineSave } from "@/lib/secureOfflineStore";

interface Hmo {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string;
}

interface Plan {
  id: string;
  hmo_id: string;
  plan_name: string;
  coverage_limit: number;
  used_amount: number;
  status: string;
}

export default function HmoManagement() {
  const { effectiveClinicId: cid } = useAccess();
  const [hmos, setHmos] = useState<Hmo[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Hmo | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", website: "" });

  const [planOpen, setPlanOpen] = useState(false);
  const [planHmo, setPlanHmo] = useState<Hmo | null>(null);
  const [planForm, setPlanForm] = useState({ plan_name: "", coverage_limit: "" });

  const load = async () => {
    if (!cid) { setHmos([]); setPlans([]); setLoading(false); return; }
    const hmoCacheKey = `hmo-management:${cid}`;
    const cached = await secureOfflineGet<{ hmos: Hmo[]; plans: Plan[] }>(hmoCacheKey);
    if (cached) {
      setHmos(cached.hmos || []);
      setPlans(cached.plans || []);
      setLoading(false);
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLoading(false);
      return;
    }

    const [h, p] = await Promise.all([
      apiClient.from("hmos").select("id,name,email,phone,website,status").eq("clinic_id", cid).order("name"),
      apiClient.from("hmo_plans").select("id,hmo_id,plan_name,coverage_limit,used_amount,status").eq("clinic_id", cid).order("created_at", { ascending: false }),
    ]);
    if (h.error || p.error) {
      if (!cached) toast.error(h.error?.message || p.error?.message || "Unable to load HMO data");
      setLoading(false);
      return;
    }
    const nextHmos = (h.data as Hmo[]) || [];
    const nextPlans = (p.data as Plan[]) || [];
    setHmos(nextHmos);
    setPlans(nextPlans);
    void secureOfflineSave(hmoCacheKey, { hmos: nextHmos, plans: nextPlans });
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const saveHmo = async () => {
    if (!cid) return toast.error("No active clinic");
    if (!form.name) return toast.error("Name required");
    if (editing) {
      const { error } = await apiClient.from("hmos").update(form).eq("clinic_id", cid).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("HMO updated");
    } else {
      const { error } = await apiClient.from("hmos").insert({ ...form, clinic_id: cid } as any);
      if (error) return toast.error(error.message);
      toast.success("HMO added");
    }
    setOpen(false); setEditing(null); setForm({ name: "", email: "", phone: "", website: "" });
    load();
  };

  const deleteHmo = async (id: string) => {
    if (!cid) return;
    if (!(await confirmDestructiveAction({ item: `HMO "${hmos.find(h => h.id === id)?.name || "selected HMO"}`, details: "Deleting an HMO may affect related plans and records.", highRisk: true }))) return;
    const { error } = await apiClient.from("hmos").delete().eq("clinic_id", cid).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  const savePlan = async () => {
    if (!cid) return toast.error("No active clinic");
    if (!planHmo || !planForm.plan_name) return toast.error("Plan name required");
    const { error } = await apiClient.from("hmo_plans").insert({
      clinic_id: cid,
      hmo_id: planHmo.id,
      plan_name: planForm.plan_name,
      coverage_limit: Number(planForm.coverage_limit) || 0,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Plan added");
    setPlanOpen(false); setPlanForm({ plan_name: "", coverage_limit: "" });
    load();
  };

  const openEdit = (h: Hmo) => { setEditing(h); setForm({ name: h.name, email: h.email || "", phone: h.phone || "", website: h.website || "" }); setOpen(true); };

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-header">HMO Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Providers, plans & coverage</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm({ name: "", email: "", phone: "", website: "" }); } }}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5"><Plus size={14} /> HMO</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit HMO" : "Add HMO"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
              <Button className="w-full rounded-xl" onClick={saveHmo}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="hmos">
        <TabsList className="grid grid-cols-2 mb-4 rounded-2xl">
          <TabsTrigger value="hmos" className="rounded-xl">Providers ({hmos.length})</TabsTrigger>
          <TabsTrigger value="plans" className="rounded-xl">Plans ({plans.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="hmos">
          {loading ? (
            <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>
          ) : hmos.length === 0 ? (
            <div className="text-center py-12"><Building2 className="mx-auto text-muted-foreground mb-2" size={32} /><p className="text-sm text-muted-foreground">No HMOs yet.</p></div>
          ) : (
            <div className="space-y-2">
              {hmos.map(h => {
                const hmoPlans = plans.filter(p => p.hmo_id === h.id);
                return (
                  <div key={h.id} className="medical-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 size={18} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{h.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{h.phone || h.email || "—"}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{hmoPlans.length} plan(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="rounded-xl" title="Manage HMO plans" onClick={() => { setPlanHmo(h); setPlanOpen(true); }}><FileText size={14} /></Button>
                        <Button variant="ghost" size="sm" className="rounded-xl" title="Edit HMO" onClick={() => openEdit(h)}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="sm" className="rounded-xl text-destructive" title="Delete HMO" onClick={() => deleteHmo(h.id)}><Trash2 size={14} /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="plans">
          {plans.length === 0 ? (
            <div className="text-center py-12"><FileText className="mx-auto text-muted-foreground mb-2" size={32} /><p className="text-sm text-muted-foreground">No plans yet.</p></div>
          ) : (
            <div className="space-y-2">
              {plans.map(pl => {
                const hmo = hmos.find(h => h.id === pl.hmo_id);
                const used = Number(pl.used_amount || 0);
                const limit = Number(pl.coverage_limit || 0);
                const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                return (
                  <div key={pl.id} className="medical-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold">{pl.plan_name}</p>
                        <p className="text-xs text-muted-foreground">{hmo?.name || "—"}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium uppercase ${pl.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{pl.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1.5 flex justify-between">
                      <span>₦{used.toLocaleString()} used</span>
                      <span>₦{limit.toLocaleString()} limit</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${pct > 80 ? "bg-destructive" : pct > 60 ? "bg-warning" : "bg-success"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Plan {planHmo && `to ${planHmo.name}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Plan Name *</Label><Input value={planForm.plan_name} onChange={e => setPlanForm({ ...planForm, plan_name: e.target.value })} placeholder="e.g. Gold, Silver" /></div>
            <div><Label>Coverage Limit (₦)</Label><Input type="number" value={planForm.coverage_limit} onChange={e => setPlanForm({ ...planForm, coverage_limit: e.target.value })} /></div>
            <Button className="w-full rounded-xl" onClick={savePlan}>Save Plan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
