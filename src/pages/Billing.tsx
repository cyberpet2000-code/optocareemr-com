import { useState, useEffect } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, FileText, Plus, X, Printer, Trash2 } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";

const PAYMENT_METHODS = ["Cash", "Card", "Transfer", "HMO"];
const ITEM_TYPES = ["Lens", "Frame", "Contact Lens", "Eye Drop", "Drugs", "Accessories", "Others"];

interface BillingRow {
  id: string;
  patient_id: string | null;
  visit_id: string | null;
  payer_type: string;
  consultation_fee: number;
  items_total: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  hmo_id: string | null;
  created_at: string;
  patient_name?: string;
  hmo_name?: string;
}

interface BillItem {
  id?: string;
  item_type: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Patient {
  id: string;
  full_name: string;
  payment_type: string;
  active_hmo_id: string | null;
}

export default function Billing() {
  const { effectiveClinicId: cid } = useAccess();
  const [bills, setBills] = useState<BillingRow[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hmoMap, setHmoMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentBillingId, setPaymentBillingId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [billItems, setBillItems] = useState<Record<string, BillItem[]>>({});
  const [form, setForm] = useState({
    patientId: "",
    consultationFee: "",
    notes: "",
  });
  const [items, setItems] = useState<BillItem[]>([]);

  useEffect(() => { loadData(); }, [cid]);

  const loadData = async () => {
    if (!cid) { setBills([]); setPatients([]); setLoading(false); return; }
    const [billRes, patRes, hmoRes] = await Promise.all([
      apiClient.from("billing").select("*").eq("clinic_id", cid).order("created_at", { ascending: false }).limit(100),
      apiClient.from("patients").select("id, full_name, payment_type, active_hmo_id").eq("clinic_id", cid).order("full_name"),
      apiClient.from("hmos").select("id, name").eq("clinic_id", cid),
    ]);
    console.debug("[billing]", { clinic_id: cid, bills: billRes.data?.length ?? 0 });
    const hmap = new Map((hmoRes.data || []).map((h: any) => [h.id, h.name]));
    setHmoMap(hmap);
    setPatients((patRes.data || []) as any);
    if (billRes.data) {
      const pIds = [...new Set(billRes.data.map((b: any) => b.patient_id).filter(Boolean))] as string[];
      let pMap = new Map<string, string>();
      if (pIds.length) {
        const { data: pats } = await apiClient.from("patients").select("id, full_name").eq("clinic_id", cid).in("id", pIds);
        pMap = new Map((pats || []).map((p: any) => [p.id, p.full_name]));
      }
      setBills(billRes.data.map((b: any) => ({
        ...b,
        patient_name: b.patient_id ? pMap.get(b.patient_id) || "Unknown" : "Walk-in",
        hmo_name: b.hmo_id ? hmap.get(b.hmo_id) : undefined,
      })) as BillingRow[]);
    }
    setLoading(false);
  };

  const selectedPatient = patients.find(p => p.id === form.patientId);

  const addItem = () => setItems([...items, { item_type: "Lens", item_name: "", quantity: 1, unit_price: 0, total_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<BillItem>) => {
    setItems(items.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      merged.total_price = (Number(merged.quantity) || 0) * (Number(merged.unit_price) || 0);
      return merged;
    }));
  };

  const itemsTotal = items.reduce((s, it) => s + (Number(it.total_price) || 0), 0);
  const consult = parseFloat(form.consultationFee) || 0;
  const grandTotal = itemsTotal + consult;

  const handleCreate = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    if (!form.patientId) { toast.error("Select a patient"); return; }
    if (grandTotal <= 0) { toast.error("Add a consultation fee or items"); return; }
    setSaving(true);
    const isHmo = selectedPatient?.payment_type === "hmo";
    const { data: bill, error } = await apiClient.from("billing").insert({
      clinic_id: cid,
      patient_id: form.patientId,
      payer_type: isHmo ? "hmo" : "private",
      hmo_id: isHmo ? selectedPatient?.active_hmo_id : null,
      consultation_fee: consult,
      notes: form.notes || null,
      status: "pending",
    } as any).select().single();
    if (error || !bill) { toast.error(error?.message || "Failed"); setSaving(false); return; }

    if (items.length > 0) {
      const payload = items.map(it => ({
        clinic_id: cid,
        billing_id: (bill as any).id,
        item_type: it.item_type,
        item_name: it.item_name || it.item_type,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
      }));
      const { error: itemErr } = await apiClient.from("billing_items").insert(payload as any);
      if (itemErr) toast.error("Items: " + itemErr.message);
    }else {
      
    // deduct inventory after save
    for (const it of items) {
      const name =
        (it.item_name || "").trim();

      if (!name) continue;

      const { data: stock } =
        await apiClient
          .from("inventory")
          .select("id, quantity")
          .eq("clinic_id", cid)
          .ilike("item_name", name)
          .maybeSingle();

      if (!stock) continue;

      const currentQty =
        Number(stock.quantity) || 0;

      const billedQty =
        Number(it.quantity) || 0;

      const nextQty =
        Math.max(
          currentQty - billedQty,
          0
        );

      const { error: stockErr } =
        await apiClient
          .from("inventory")
          .update({
            quantity: nextQty,
          })
          .eq("id", stock.id);

      if (stockErr) {
        console.error(
          "[inventory deduct]",
          stockErr
        );
      }
    }
  }
  }

    if (isHmo && selectedPatient?.active_hmo_id) {
      await apiClient.from("hmo_claims").insert({
        clinic_id: cid,
        billing_id: (bill as any).id,
        hmo_id: selectedPatient.active_hmo_id,
        hmo_name: hmoMap.get(selectedPatient.active_hmo_id) || "",
        patient_id: form.patientId,
        service_cost: grandTotal,
        approved_amount: 0,
        co_payment: 0,
        status: "Pending",
      } as any);
    }

    setSaving(false);
    toast.success("Bill created" + (isHmo ? " & HMO claim filed" : ""));
    setShowForm(false);
    setForm({ patientId: "", consultationFee: "", notes: "" });
    setItems([]);
    loadData();
  };

  const loadBillItems = async (billingId: string) => {
    if (!cid) return;
    const { data } = await apiClient.from("billing_items").select("*").eq("clinic_id", cid).eq("billing_id", billingId);
    setBillItems(prev => ({ ...prev, [billingId]: (data || []) as any }));
  };

  const addPayment = async () => {
    if (!paymentBillingId || !paymentAmount) return;
    const amt = parseFloat(paymentAmount);
    if (amt <= 0) { toast.error("Enter valid amount"); return; }
    const { error } = await apiClient.from("payments").insert({
      billing_id: paymentBillingId,
      amount: amt,
      method: paymentMethod,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded");
    setPaymentBillingId(null);
    setPaymentAmount("");
    loadData();
  };

  const printReceipt = async (b: BillingRow) => {
    if (!billItems[b.id]) await loadBillItems(b.id);
    const its = billItems[b.id] || [];
    const grouped: Record<string, BillItem[]> = {};
    its.forEach(it => { (grouped[it.item_type] ||= []).push(it); });
    const w = window.open("", "_blank");
    if (!w) return;
    const itemsHtml = Object.entries(grouped).map(([type, list]) => `
      <p style="margin:8px 0 2px;font-weight:bold;font-size:12px">${type}</p>
      ${list.map(it => `<div class="row"><span>${it.item_name} × ${it.quantity}</span><span>₦${Number(it.total_price).toLocaleString()}</span></div>`).join("")}
    `).join("");
    w.document.write(`
      <html><head><title>Receipt</title><style>
        body{font-family:sans-serif;padding:20px;max-width:420px;margin:auto}
        h2{text-align:center;margin:0}hr{border:1px dashed #ccc}
        .row{display:flex;justify-content:space-between;margin:4px 0;font-size:13px}
        .total{font-weight:bold;font-size:15px}
      </style></head><body>
        <h2>Optocare EMR</h2>
        <p style="text-align:center;font-size:12px;color:#666">${new Date(b.created_at).toLocaleString()}</p>
        <hr/>
        <div class="row"><span>Patient:</span><span>${b.patient_name}</span></div>
        <div class="row"><span>Payer:</span><span>${b.payer_type === "hmo" ? (b.hmo_name || "HMO") : "Private"}</span></div>
        <hr/>
        ${b.consultation_fee > 0 ? `<div class="row"><span>Consultation</span><span>₦${Number(b.consultation_fee).toLocaleString()}</span></div>` : ""}
        ${itemsHtml}
        <hr/>
        <div class="row total"><span>Total</span><span>₦${Number(b.total_amount).toLocaleString()}</span></div>
        <div class="row"><span>Paid</span><span>₦${Number(b.amount_paid).toLocaleString()}</span></div>
        <div class="row"><span>Balance</span><span>₦${Number(b.balance).toLocaleString()}</span></div>
        <div class="row"><span>Status</span><span>${b.status.toUpperCase()}</span></div>
        <hr/>
        <p style="text-align:center;font-size:11px;color:#999">Thank you</p>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const statusColor = (s: string) => {
    if (s === "paid") return "bg-success/10 text-success";
    if (s === "partial") return "bg-warning/10 text-warning";
    return "bg-primary/10 text-primary";
  };

  const pendingBills = bills.filter(b => b.status !== "paid");

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-header">Billing</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="rounded-xl gap-1.5">
          {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Bill</>}
        </Button>
      </div>

      {showForm && (
        <div className="form-section mb-5 max-w-2xl animate-fade-in">
          <h2 className="section-title text-sm">Create Bill</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Patient *</Label>
                <Select value={form.patientId} onValueChange={v => setForm(f => ({ ...f, patientId: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.payment_type})</SelectItem>)}</SelectContent>
                </Select>
                {selectedPatient?.payment_type === "hmo" && (
                  <p className="text-[10px] text-accent font-medium">HMO claim will be auto-created</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Consultation Fee (₦)</Label>
                <Input className="rounded-xl" type="number" min={0} value={form.consultationFee} onChange={e => setForm(f => ({ ...f, consultationFee: e.target.value }))} />
              </div>
            </div>

            <div className="border-t border-border/60 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold">Line Items</p>
                <Button type="button" size="sm" variant="outline" className="rounded-xl gap-1" onClick={addItem}><Plus size={12} /> Add Item</Button>
              </div>
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">No items. Add lens, frame, drugs, etc.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5 items-end bg-muted/40 rounded-xl p-2">
                      <div className="col-span-3">
                        <Label className="text-[10px]">Type</Label>
                        <Select value={it.item_type} onValueChange={v => updateItem(idx, { item_type: v })}>
                          <SelectTrigger className="rounded-lg h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <Label className="text-[10px]">Name</Label>
                        <Input className="rounded-lg h-8 text-xs" value={it.item_name} onChange={e => updateItem(idx, { item_name: e.target.value })} placeholder="Item name" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px]">Qty</Label>
                        <Input className="rounded-lg h-8 text-xs" type="number" min={1} value={it.quantity} onChange={e => updateItem(idx, { quantity: parseInt(e.target.value) || 1 })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px]">Unit ₦</Label>
                        <Input className="rounded-lg h-8 text-xs" type="number" min={0} value={it.unit_price} onChange={e => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <button onClick={() => removeItem(idx)} className="col-span-1 p-1.5 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center"><Trash2 size={12} /></button>
                      <p className="col-span-12 text-[10px] text-right text-muted-foreground">Line total: ₦{(it.total_price || 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-muted/50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[10px] text-muted-foreground">Items</p><p className="text-sm font-bold">₦{itemsTotal.toLocaleString()}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Consultation</p><p className="text-sm font-bold">₦{consult.toLocaleString()}</p></div>
              <div><p className="text-[10px] text-muted-foreground">TOTAL</p><p className="text-base font-bold text-primary">₦{grandTotal.toLocaleString()}</p></div>
            </div>

            <Button className="rounded-xl w-full" onClick={handleCreate} disabled={saving}>{saving ? "Saving..." : "Create Bill"}</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="bg-muted/50 rounded-2xl p-1">
          <TabsTrigger value="pending" className="rounded-xl text-xs gap-1"><DollarSign size={12} /> Pending ({pendingBills.length})</TabsTrigger>
          <TabsTrigger value="all" className="rounded-xl text-xs gap-1"><FileText size={12} /> All ({bills.length})</TabsTrigger>
        </TabsList>

        {[
          { value: "pending", list: pendingBills },
          { value: "all", list: bills },
        ].map(tab => (
          <TabsContent key={tab.value} value={tab.value}>
            {loading ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
            ) : tab.list.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No bills.</div>
            ) : (
              <div className="space-y-2">
                {tab.list.map(b => (
                  <div key={b.id} className="medical-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{b.patient_name}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md uppercase ${b.payer_type === "hmo" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
                            {b.payer_type === "hmo" ? (b.hmo_name || "HMO") : "Private"}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md uppercase ${statusColor(b.status)}`}>{b.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ₦{Number(b.total_amount).toLocaleString()} • Paid: ₦{Number(b.amount_paid).toLocaleString()}
                          {Number(b.balance) > 0 && ` • Bal: ₦${Number(b.balance).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {b.status !== "paid" && (
                          <Button variant="ghost" size="sm" className="rounded-xl text-xs" onClick={() => setPaymentBillingId(b.id)}>
                            <Plus size={12} className="mr-1" /> Pay
                          </Button>
                        )}
                        <button onClick={() => printReceipt(b)} className="p-2 rounded-xl hover:bg-muted transition-colors">
                          <Printer size={14} className="text-muted-foreground" />
                        </button>
                      </div>
                    </div>

                    {paymentBillingId === b.id && (
                      <div className="mt-3 pt-3 border-t border-border/60 animate-fade-in">
                        <p className="text-xs font-semibold mb-2">Add Payment (Balance: ₦{Number(b.balance).toLocaleString()})</p>
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
