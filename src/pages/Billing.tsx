import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, FileText, Plus, Search, CheckCircle2, Clock, XCircle } from "lucide-react";

const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Mobile Payment"];
const CLAIM_STATUSES = ["Pending", "Approved", "Partial", "Paid", "Rejected"];

interface BillingRecord {
  id: string;
  patient_id: number;
  visit_id: number | null;
  consultation_fee: number;
  drug_cost: number;
  glasses_cost: number;
  other_charges: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_method: string;
  payment_status: string;
  patient_type: string;
  created_at: string;
  patient_name?: string;
}

interface HmoClaim {
  id: string;
  billing_id: string;
  patient_id: number;
  hmo_name: string;
  service_cost: number;
  approved_amount: number;
  co_payment: number;
  status: string;
  notes: string | null;
  created_at: string;
  patient_name?: string;
}

interface PatientOption {
  id: number;
  full_name: string;
  patient_type: string;
  hmo_provider: string | null;
}

export default function Billing() {
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [claims, setClaims] = useState<HmoClaim[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [form, setForm] = useState({
    patientId: "", consultationFee: "", drugCost: "", glassesCost: "", otherCharges: "",
    amountPaid: "", paymentMethod: "Cash", notes: "",
  });

  useEffect(() => {
    loadData();
    supabase.from("patients").select("id, full_name, patient_type, hmo_provider").order("full_name").then(({ data }) => {
      if (data) setPatients(data as unknown as PatientOption[]);
    });
  }, []);

  const loadData = async () => {
    const [billRes, claimRes] = await Promise.all([
      supabase.from("billings").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("hmo_claims").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    if (billRes.data) {
      const pIds = [...new Set(billRes.data.map((b: any) => b.patient_id).filter(Boolean))];
      let patMap = new Map<number, string>();
      if (pIds.length > 0) {
        const { data: pats } = await supabase.from("patients").select("id, full_name").in("id", pIds as any);
        patMap = new Map((pats || []).map((p: any) => [p.id, p.full_name]));
      }
      setBillings(billRes.data.map((b: any) => ({ ...b, patient_name: patMap.get(b.patient_id) || "Unknown" })));
    }
    if (claimRes.data) {
      const pIds = [...new Set(claimRes.data.map((c: any) => c.patient_id).filter(Boolean))];
      let patMap = new Map<number, string>();
      if (pIds.length > 0) {
        const { data: pats } = await supabase.from("patients").select("id, full_name").in("id", pIds as any);
        patMap = new Map((pats || []).map((p: any) => [p.id, p.full_name]));
      }
      setClaims(claimRes.data.map((c: any) => ({ ...c, patient_name: patMap.get(c.patient_id) || "Unknown" })));
    }
    setLoading(false);
  };

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const onPatientSelect = (patientIdStr: string) => {
    setField("patientId", patientIdStr);
    const pat = patients.find(p => String(p.id) === patientIdStr);
    setSelectedPatient(pat || null);
  };

  const total = (parseFloat(form.consultationFee) || 0) + (parseFloat(form.drugCost) || 0) +
    (parseFloat(form.glassesCost) || 0) + (parseFloat(form.otherCharges) || 0);
  const paid = parseFloat(form.amountPaid) || 0;
  const balance = total - paid;
  const paymentStatus = balance <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

  const handleSubmit = async () => {
    if (!form.patientId) { toast.error("Select a patient"); return; }
    if (total <= 0) { toast.error("Add at least one charge"); return; }
    setSaving(true);

    const patType = selectedPatient?.patient_type || "Private";

    const { data: billing, error } = await supabase.from("billings").insert({
      patient_id: parseInt(form.patientId),
      consultation_fee: parseFloat(form.consultationFee) || 0,
      drug_cost: parseFloat(form.drugCost) || 0,
      glasses_cost: parseFloat(form.glassesCost) || 0,
      other_charges: parseFloat(form.otherCharges) || 0,
      total_amount: total,
      amount_paid: paid,
      balance: balance > 0 ? balance : 0,
      payment_method: form.paymentMethod,
      payment_status: paymentStatus,
      patient_type: patType,
    }).select().single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    // If HMO, auto-create claim
    if (patType === "HMO" && billing) {
      await supabase.from("hmo_claims").insert({
        billing_id: (billing as any).id,
        patient_id: parseInt(form.patientId),
        hmo_name: selectedPatient?.hmo_provider || "",
        service_cost: total,
        approved_amount: 0,
        co_payment: paid,
        status: "Pending",
        notes: form.notes || null,
      });
    }

    setSaving(false);
    toast.success("Billing created" + (patType === "HMO" ? " & HMO claim filed" : ""));
    setShowForm(false);
    setForm({ patientId: "", consultationFee: "", drugCost: "", glassesCost: "", otherCharges: "", amountPaid: "", paymentMethod: "Cash", notes: "" });
    setSelectedPatient(null);
    loadData();
  };

  const updateClaimStatus = async (claimId: string, status: string, approvedAmount?: number) => {
    const update: any = { status };
    if (approvedAmount !== undefined) update.approved_amount = approvedAmount;
    await supabase.from("hmo_claims").update(update).eq("id", claimId);
    toast.success("Claim status updated");
    loadData();
  };

  const statusColor = (s: string) => {
    if (s === "Paid") return "bg-success/10 text-success";
    if (s === "Partial" || s === "Approved") return "bg-warning/10 text-warning";
    if (s === "Rejected") return "bg-destructive/10 text-destructive";
    if (s === "Pending") return "bg-primary/10 text-primary";
    return "bg-muted text-muted-foreground";
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header">Billing & Claims</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          {showForm ? <><XCircle size={14} className="mr-1" /> Cancel</> : <><Plus size={14} className="mr-1" /> New Bill</>}
        </Button>
      </div>

      {showForm && (
        <div className="form-section mb-6 max-w-xl">
          <h2 className="section-title text-base">Create Bill</h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Patient *</Label>
              <Select value={form.patientId} onValueChange={onPatientSelect}>
                <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.full_name} ({p.patient_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPatient?.patient_type === "HMO" && (
                <p className="text-xs text-accent">HMO: {selectedPatient.hmo_provider} — claim will be auto-created</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Consultation Fee (₦)</Label><Input type="number" min={0} value={form.consultationFee} onChange={e => setField("consultationFee", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Drug Cost (₦)</Label><Input type="number" min={0} value={form.drugCost} onChange={e => setField("drugCost", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Glasses Cost (₦)</Label><Input type="number" min={0} value={form.glassesCost} onChange={e => setField("glassesCost", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Other Charges (₦)</Label><Input type="number" min={0} value={form.otherCharges} onChange={e => setField("otherCharges", e.target.value)} /></div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="font-bold text-lg">Total: ₦{total.toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Amount Paid (₦)</Label><Input type="number" min={0} value={form.amountPaid} onChange={e => setField("amountPaid", e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setField("paymentMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span>Balance: <strong className={balance > 0 ? "text-destructive" : "text-success"}>₦{Math.max(0, balance).toLocaleString()}</strong></span>
              <span className={`text-xs px-2 py-0.5 rounded ${statusColor(paymentStatus)}`}>{paymentStatus}</span>
            </div>
            {selectedPatient?.patient_type === "HMO" && (
              <div className="space-y-1.5"><Label>Claim Notes</Label><Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} rows={2} maxLength={500} /></div>
            )}
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Create Bill"}</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="billings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="billings"><DollarSign size={14} className="mr-1" /> Billings</TabsTrigger>
          <TabsTrigger value="claims"><FileText size={14} className="mr-1" /> HMO Claims ({claims.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="billings">
          <div className="medical-card">
            {loading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
            ) : billings.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No billings yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {billings.map(b => (
                  <div key={b.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{b.patient_name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${b.patient_type === "HMO" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>{b.patient_type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${statusColor(b.payment_status)}`}>{b.payment_status}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ₦{Number(b.total_amount).toLocaleString()} • Paid: ₦{Number(b.amount_paid).toLocaleString()}
                          {Number(b.balance) > 0 && ` • Bal: ₦${Number(b.balance).toLocaleString()}`}
                          {` • ${b.payment_method}`}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="claims">
          <div className="medical-card">
            {loading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
            ) : claims.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No HMO claims.</p>
            ) : (
              <div className="divide-y divide-border">
                {claims.map(c => (
                  <div key={c.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{c.patient_name}</p>
                          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded">{c.hmo_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${statusColor(c.status)}`}>{c.status}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Service: ₦{Number(c.service_cost).toLocaleString()}
                          {Number(c.approved_amount) > 0 && ` • Approved: ₦${Number(c.approved_amount).toLocaleString()}`}
                          {Number(c.co_payment) > 0 && ` • Co-pay: ₦${Number(c.co_payment).toLocaleString()}`}
                        </p>
                        {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                      </div>
                      {c.status === "Pending" && (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => {
                            const amt = prompt("Enter approved amount:");
                            if (amt) updateClaimStatus(c.id, "Approved", parseFloat(amt));
                          }}>Approve</Button>
                          <Button variant="ghost" size="sm" onClick={() => updateClaimStatus(c.id, "Rejected")}>
                            <XCircle size={14} className="text-destructive" />
                          </Button>
                        </div>
                      )}
                      {c.status === "Approved" && (
                        <Button variant="outline" size="sm" onClick={() => updateClaimStatus(c.id, "Paid")}>
                          <CheckCircle2 size={14} className="mr-1" /> Mark Paid
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
