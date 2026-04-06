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
import { DollarSign, FileText, Plus, X, CheckCircle2, Clock, XCircle, Printer } from "lucide-react";

const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Mobile Payment"];
const CLAIM_STATUSES = ["Pending", "Approved", "Partial", "Paid", "Rejected"];

interface BillingRecord {
  id: string; patient_id: number; visit_id: number | null;
  consultation_fee: number; drug_cost: number; glasses_cost: number; other_charges: number;
  total_amount: number; amount_paid: number; balance: number;
  payment_method: string; payment_status: string; patient_type: string; created_at: string;
  patient_name?: string;
}

interface HmoClaim {
  id: string; billing_id: string; patient_id: number; hmo_name: string;
  service_cost: number; approved_amount: number; co_payment: number;
  status: string; notes: string | null; created_at: string; patient_name?: string;
}

interface PaymentRecord {
  id: string; billing_id: string; amount: number; payment_method: string; created_at: string;
}

export default function Billing() {
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [claims, setClaims] = useState<HmoClaim[]>([]);
  const [patients, setPatients] = useState<{ id: number; full_name: string; patient_type: string; hmo_provider: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [paymentBillingId, setPaymentBillingId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [form, setForm] = useState({
    patientId: "", consultationFee: "", drugCost: "", glassesCost: "", otherCharges: "",
    amountPaid: "", paymentMethod: "Cash", notes: "",
  });

  useEffect(() => {
    loadData();
    supabase.from("patients").select("id, full_name, patient_type, hmo_provider").order("full_name").then(({ data }) => {
      if (data) setPatients(data as any);
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
  const onPatientSelect = (id: string) => {
    setField("patientId", id);
    setSelectedPatient(patients.find(p => String(p.id) === id) || null);
  };

  const total = (parseFloat(form.consultationFee) || 0) + (parseFloat(form.drugCost) || 0) +
    (parseFloat(form.glassesCost) || 0) + (parseFloat(form.otherCharges) || 0);
  const paid = parseFloat(form.amountPaid) || 0;
  const balance = total - paid;
  const paymentStatus = balance <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

  const handleSubmit = async () => {
    if (!form.patientId) { toast.error("Select a patient"); return; }
    if (total <= 0) { toast.error("Add charges"); return; }
    setSaving(true);
    const patType = selectedPatient?.patient_type || "Private";
    const { data: billing, error } = await supabase.from("billings").insert({
      patient_id: parseInt(form.patientId), consultation_fee: parseFloat(form.consultationFee) || 0,
      drug_cost: parseFloat(form.drugCost) || 0, glasses_cost: parseFloat(form.glassesCost) || 0,
      other_charges: parseFloat(form.otherCharges) || 0, total_amount: total,
      amount_paid: paid, balance: Math.max(0, balance), payment_method: form.paymentMethod,
      payment_status: paymentStatus, patient_type: patType,
    }).select().single();

    if (error) { toast.error(error.message); setSaving(false); return; }
    if (patType === "HMO" && billing) {
      await supabase.from("hmo_claims").insert({
        billing_id: (billing as any).id, patient_id: parseInt(form.patientId),
        hmo_name: selectedPatient?.hmo_provider || "", service_cost: total,
        approved_amount: 0, co_payment: paid, status: "Pending", notes: form.notes || null,
      });
    }
    // Record initial payment
    if (paid > 0 && billing) {
      await supabase.from("payments").insert({
        billing_id: (billing as any).id, patient_id: parseInt(form.patientId),
        amount: paid, payment_method: form.paymentMethod,
      } as any);
    }
    setSaving(false);
    toast.success("Bill created" + (patType === "HMO" ? " & HMO claim filed" : ""));
    setShowForm(false);
    setForm({ patientId: "", consultationFee: "", drugCost: "", glassesCost: "", otherCharges: "", amountPaid: "", paymentMethod: "Cash", notes: "" });
    setSelectedPatient(null);
    loadData();
  };

  const addPayment = async () => {
    if (!paymentBillingId || !paymentAmount) return;
    const amt = parseFloat(paymentAmount);
    if (amt <= 0) { toast.error("Enter valid amount"); return; }
    const bill = billings.find(b => b.id === paymentBillingId);
    if (!bill) return;

    await supabase.from("payments").insert({
      billing_id: paymentBillingId, patient_id: bill.patient_id,
      amount: amt, payment_method: paymentMethod,
    } as any);

    const newPaid = Number(bill.amount_paid) + amt;
    const newBalance = Math.max(0, Number(bill.total_amount) - newPaid);
    const newStatus = newBalance <= 0 ? "Paid" : "Partial";
    await supabase.from("billings").update({
      amount_paid: newPaid, balance: newBalance, payment_status: newStatus,
    }).eq("id", paymentBillingId);

    toast.success("Payment recorded");
    setPaymentBillingId(null);
    setPaymentAmount("");
    loadData();
  };

  const loadPayments = async (billingId: string) => {
    const { data } = await supabase.from("payments").select("*").eq("billing_id", billingId).order("created_at", { ascending: false });
    setPayments((data || []) as any);
  };

  const updateClaimStatus = async (claimId: string, status: string, approvedAmount?: number) => {
    const update: any = { status };
    if (approvedAmount !== undefined) update.approved_amount = approvedAmount;
    await supabase.from("hmo_claims").update(update).eq("id", claimId);
    toast.success("Claim updated");
    loadData();
  };

  const printReceipt = (b: BillingRecord) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Receipt</title><style>body{font-family:sans-serif;padding:20px;max-width:400px;margin:auto}h2{text-align:center}hr{border:1px dashed #ccc}.row{display:flex;justify-content:space-between;margin:6px 0;font-size:14px}.total{font-weight:bold;font-size:16px}</style></head>
      <body>
        <h2>Optocare EMR</h2>
        <p style="text-align:center;font-size:12px;color:#666">${new Date(b.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        <hr/>
        <div class="row"><span>Patient:</span><span>${b.patient_name}</span></div>
        <div class="row"><span>Type:</span><span>${b.patient_type}</span></div>
        <hr/>
        <div class="row"><span>Consultation:</span><span>₦${Number(b.consultation_fee).toLocaleString()}</span></div>
        <div class="row"><span>Drugs:</span><span>₦${Number(b.drug_cost).toLocaleString()}</span></div>
        <div class="row"><span>Glasses:</span><span>₦${Number(b.glasses_cost).toLocaleString()}</span></div>
        <div class="row"><span>Other:</span><span>₦${Number(b.other_charges).toLocaleString()}</span></div>
        <hr/>
        <div class="row total"><span>Total:</span><span>₦${Number(b.total_amount).toLocaleString()}</span></div>
        <div class="row"><span>Paid:</span><span>₦${Number(b.amount_paid).toLocaleString()}</span></div>
        <div class="row"><span>Balance:</span><span>₦${Number(b.balance).toLocaleString()}</span></div>
        <div class="row"><span>Status:</span><span>${b.payment_status}</span></div>
        <hr/>
        <p style="text-align:center;font-size:11px;color:#999">Thank you for choosing Optocare</p>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const statusColor = (s: string) => {
    if (s === "Paid") return "bg-success/10 text-success";
    if (s === "Partial" || s === "Approved") return "bg-warning/10 text-warning";
    if (s === "Rejected") return "bg-destructive/10 text-destructive";
    return "bg-primary/10 text-primary";
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-header">Billing</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="rounded-xl gap-1.5">
          {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Bill</>}
        </Button>
      </div>

      {showForm && (
        <div className="form-section mb-5 max-w-xl animate-fade-in">
          <h2 className="section-title text-sm">Create Bill</h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Patient *</Label>
              <Select value={form.patientId} onValueChange={onPatientSelect}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>{patients.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.full_name} ({p.patient_type})</SelectItem>)}</SelectContent>
              </Select>
              {selectedPatient?.patient_type === "HMO" && (
                <p className="text-[10px] text-accent font-medium">HMO: {selectedPatient.hmo_provider} — claim auto-created</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Consultation (₦)</Label><Input className="rounded-xl" type="number" min={0} value={form.consultationFee} onChange={e => setField("consultationFee", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Drug Cost (₦)</Label><Input className="rounded-xl" type="number" min={0} value={form.drugCost} onChange={e => setField("drugCost", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Glasses (₦)</Label><Input className="rounded-xl" type="number" min={0} value={form.glassesCost} onChange={e => setField("glassesCost", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Other (₦)</Label><Input className="rounded-xl" type="number" min={0} value={form.otherCharges} onChange={e => setField("otherCharges", e.target.value)} /></div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">₦{total.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Total Amount</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Amount Paid (₦)</Label><Input className="rounded-xl" type="number" min={0} value={form.amountPaid} onChange={e => setField("amountPaid", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setField("paymentMethod", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span>Balance: <strong className={balance > 0 ? "text-destructive" : "text-success"}>₦{Math.max(0, balance).toLocaleString()}</strong></span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md ${statusColor(paymentStatus)}`}>{paymentStatus}</span>
            </div>
            {selectedPatient?.patient_type === "HMO" && (
              <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea className="rounded-xl" value={form.notes} onChange={e => setField("notes", e.target.value)} rows={2} /></div>
            )}
            <Button className="rounded-xl" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Create Bill"}</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="billings" className="space-y-4">
        <TabsList className="bg-muted/50 rounded-2xl p-1">
          <TabsTrigger value="billings" className="rounded-xl text-xs gap-1"><DollarSign size={12} /> Bills</TabsTrigger>
          <TabsTrigger value="claims" className="rounded-xl text-xs gap-1"><FileText size={12} /> HMO ({claims.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="billings">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          ) : billings.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No billings yet.</div>
          ) : (
            <div className="space-y-2">
              {billings.map(b => (
                <div key={b.id} className="medical-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{b.patient_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${b.patient_type === "HMO" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>{b.patient_type}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${statusColor(b.payment_status)}`}>{b.payment_status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ₦{Number(b.total_amount).toLocaleString()} • Paid: ₦{Number(b.amount_paid).toLocaleString()}
                        {Number(b.balance) > 0 && ` • Bal: ₦${Number(b.balance).toLocaleString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {b.payment_status !== "Paid" && (
                        <Button variant="ghost" size="sm" className="rounded-xl text-xs" onClick={() => { setPaymentBillingId(b.id); loadPayments(b.id); }}>
                          <Plus size={12} className="mr-1" /> Pay
                        </Button>
                      )}
                      <button onClick={() => printReceipt(b)} className="p-2 rounded-xl hover:bg-muted transition-colors">
                        <Printer size={14} className="text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {/* Payment modal inline */}
                  {paymentBillingId === b.id && (
                    <div className="mt-3 pt-3 border-t border-border/60 animate-fade-in">
                      <p className="text-xs font-semibold mb-2">Add Payment</p>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px]">Amount (₦)</Label>
                          <Input className="rounded-xl h-8 text-xs" type="number" min={0} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                        </div>
                        <div className="w-28 space-y-1">
                          <Label className="text-[10px]">Method</Label>
                          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger className="rounded-xl h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" className="rounded-xl h-8" onClick={addPayment}>Add</Button>
                        <Button size="sm" variant="ghost" className="rounded-xl h-8" onClick={() => setPaymentBillingId(null)}>
                          <X size={12} />
                        </Button>
                      </div>
                      {payments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] text-muted-foreground font-medium">Payment History</p>
                          {payments.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-2 py-1.5">
                              <span>₦{Number(p.amount).toLocaleString()} • {p.payment_method}</span>
                              <span className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="claims">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          ) : claims.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No HMO claims.</div>
          ) : (
            <div className="space-y-2">
              {claims.map(c => (
                <div key={c.id} className="medical-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{c.patient_name}</p>
                        <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-md">{c.hmo_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${statusColor(c.status)}`}>{c.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Service: ₦{Number(c.service_cost).toLocaleString()}
                        {Number(c.approved_amount) > 0 && ` • Approved: ₦${Number(c.approved_amount).toLocaleString()}`}
                      </p>
                    </div>
                    {c.status === "Pending" && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => {
                          const amt = prompt("Approved amount:");
                          if (amt) updateClaimStatus(c.id, "Approved", parseFloat(amt));
                        }}>Approve</Button>
                        <button onClick={() => updateClaimStatus(c.id, "Rejected")} className="p-2 rounded-xl hover:bg-muted transition-colors">
                          <XCircle size={14} className="text-destructive" />
                        </button>
                      </div>
                    )}
                    {c.status === "Approved" && (
                      <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => updateClaimStatus(c.id, "Paid")}>
                        <CheckCircle2 size={12} className="mr-1" /> Paid
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
