import OptoLoader from "@/components/OptoLoader";
import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, FileText, Plus, X, Printer, Trash2, ShoppingBag } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";
import { offlineStore } from "@/lib/offlineStore";
import { useOffline } from "@/hooks/useOffline";
import WalkInSale from "@/components/billing/WalkInSale";
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
  const [searchParams] = useSearchParams();

  const monthFilter =
    searchParams.get("month");
  const { isOffline } = useOffline();
  const [bills, setBills] = useState<BillingRow[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hmoMap, setHmoMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingBilling, setLoadingBilling] = useState(false);
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
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedLookupPatient, setSelectedLookupPatient] =
    useState<Patient | null>(null);

  const [lookupBills, setLookupBills] =
    useState<BillingRow[]>([]);

  const [lookupPayments, setLookupPayments] =
    useState<any[]>([]);

  const [inventoryItems, setInventoryItems] =
    useState<any[]>([]);

  // State for editing mode (when a billing record is selected)
  const [editingBillingId, setEditingBillingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!cid) { setBills([]); setPatients([]); setLoading(false); return; }
    const billsKey = `bills:${cid}`;
    const patientsKey = `billing-patients:${cid}`;
    const hmosKey = `billing-hmos:${cid}`;

    const hydrateFromCache = () => {
      const cBills = offlineStore.get<BillingRow[]>(billsKey);
      const cPats = offlineStore.get<Patient[]>(patientsKey);
      const cHmos = offlineStore.get<Array<{ id: string; name: string }>>(hmosKey);
      if (cBills) setBills(cBills);
      if (cPats) setPatients(cPats);
      if (cHmos) setHmoMap(new Map(cHmos.map(h => [h.id, h.name])));
      setLoading(false);
    };

    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      hydrateFromCache();
      return;
    }

    try {
      const [
        billRes,
        patRes,
        hmoRes,
        inventoryRes
      ] = await Promise.all([
        apiClient.from("billing")
          .select("*")
          .eq("clinic_id", cid)
          .order("created_at", { ascending: false })
          .limit(100),

        apiClient.from("patients")
          .select("id, full_name, payment_type, active_hmo_id")
          .eq("clinic_id", cid)
          .order("full_name"),

        apiClient.from("hmos")
          .select("id, name")
          .eq("clinic_id", cid),

        apiClient.from("inventory")
          .select("*")
          .eq("clinic_id", cid)
      ]);
      if (billRes.error && patRes.error) { hydrateFromCache(); return; }
      console.debug("[billing]", { clinic_id: cid, bills: billRes.data?.length ?? 0 });
      const hmosList = (hmoRes.data || []) as Array<{ id: string; name: string }>;
      const hmap = new Map(hmosList.map((h: any) => [h.id, h.name]));
      setHmoMap(hmap);
      const pats = (patRes.data || []) as Patient[];
      setPatients(pats);
      setInventoryItems(
        inventoryRes.data || []
      );
      offlineStore.save(patientsKey, pats);
      offlineStore.save(hmosKey, hmosList);
      if (billRes.data) {
        const pIds = [...new Set(billRes.data.map((b: any) => b.patient_id).filter(Boolean))] as string[];
        let pMap = new Map<string, string>();
        if (pIds.length) {
          const { data: pn } = await apiClient.from("patients").select("id, full_name").eq("clinic_id", cid).in("id", pIds);
          pMap = new Map((pn || []).map((p: any) => [p.id, p.full_name]));
        }
        const enriched = billRes.data.map((b: any) => ({
          ...b,
          patient_name: b.patient_id ? pMap.get(b.patient_id) || "Unknown" : "Walk-in",
          hmo_name: b.hmo_id ? hmap.get(b.hmo_id) : undefined,
        })) as BillingRow[];
        setBills(enriched);
        offlineStore.save(billsKey, enriched);
      }
      setLoading(false);
    } catch (e) {
      console.warn("[billing] load failed, using cache", e);
      hydrateFromCache();
    }
  }, [cid, isOffline]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const onSync = (ev: Event) => {
      const e = ev as CustomEvent<{ clinicId?: string }>;
      if (!e?.detail?.clinicId) return;
      if (e.detail.clinicId === cid) loadData();
    };
    window.addEventListener("optocare:sync:done", onSync as EventListener);
    return () => window.removeEventListener("optocare:sync:done", onSync as EventListener);
  }, [cid, loadData]);

  const selectedPatient = patients.find(p => p.id === form.patientId);
  const loadPatientBilling = async (
    patient: Patient
  ) => {
    if (!cid) return;

    setLoadingBilling(true);
    setSelectedLookupPatient(patient);

    setForm((f) => ({
      ...f,
      patientId: patient.id,
    }));

    setShowForm(true);
    setPatientSearch("");

    try {
      
      const { data: billsRes, error } = await apiClient
  .from("billing")
  .select("*")
  .eq("clinic_id", cid)
  .eq("patient_id", patient.id)
  .order("created_at", { ascending: false });
      

      if (error) {
  console.error("Billing query error:", error);
  setEditingBillingId(null);
  setLoadingBilling(false);
  return;
      }

      const { data: paymentsRes } =
        await apiClient
          .from("payments")
          .select("*")
          .in(
            "billing_id",
            (billsRes || []).map((b) => b.id)
          );

      setLookupBills(
        (billsRes || []) as BillingRow[]
      );

      // Select the latest pending bill, or if no pending bills, the newest bill
const selectedBill =
  billsRes.find((b) => b.status !== "paid") ??
  billsRes[0];

if (!selectedBill) {
  setEditingBillingId(null);
  return;
}

setEditingBillingId(selectedBill.id);

      setLookupPayments(
        paymentsRes || []
      );
    } catch (err) {
      console.error("Error loading patient billing:", err);
      setEditingBillingId(null);
    } finally {
      setLoadingBilling(false);
    }
  };

  const filteredPatients =
    patientSearch.trim() === ""
      ? []
      : patients.filter((p) =>
          p.full_name
            .toLowerCase()
            .includes(
              patientSearch.toLowerCase()
            )
        );

  const lookupTotal =
    lookupBills.reduce(
      (sum, b) =>
        sum +
        Number(
          b.total_amount || 0
        ),
      0
    );

  const lookupPaid =
    lookupBills.reduce(
      (sum, b) =>
        sum +
        Number(
          b.amount_paid || 0
        ),
      0
    );

  const lookupBalance =
    lookupTotal - lookupPaid;

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

  /**
   * Fetch the existing billing record for a visit.
   * Assumes exactly one billing record per visit per patient.
   * Throws if none is found.
   */
  const fetchBillingByVisitId = async (visitId: string): Promise<BillingRow> => {
    const { data, error } = await apiClient
      .from("billing")
      .select("*")
      .eq("clinic_id", cid)
      .eq("visit_id", visitId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch billing record: ${error.message}`);
    }
    if (!data) {
      throw new Error("No billing record found for this visit. Expected exactly one billing record per visit.");
    }
    return data as BillingRow;
  };

  /**
   * Update the consultation fee on the existing billing record.
   */
  const updateConsultationFee = async (billingId: string, newConsultFee: number) => {
    const { error } = await apiClient
      .from("billing")
      .update({ consultation_fee: newConsultFee })
      .eq("id", billingId);

    if (error) {
      throw new Error(`Failed to update consultation fee: ${error.message}`);
    }
  };

  const handleEditBill = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    if (!form.patientId) { toast.error("Select a patient"); return; }
    if (grandTotal <= 0) { toast.error("Add a consultation fee or items"); return; }
    
    // Prevent execution if bill is still loading or no bill is selected
    if (loadingBilling || !editingBillingId) {
      if (!editingBillingId && !loadingBilling) {
        toast.error("No billing record found. Please select a patient with an existing bill.");
      }
      return;
    }

    const offline = isOffline || (typeof navigator !== "undefined" && !navigator.onLine);
    if (offline) {
      const queueKey = `bills-queue:${cid}`;
      const queue = offlineStore.get<any[]>(queueKey) ?? [];
      const isHmoQ = selectedPatient?.payment_type === "hmo";
      queue.push({
        clinic_id: cid,
        patient_id: form.patientId,
        payer_type: isHmoQ ? "hmo" : "private",
        hmo_id: isHmoQ ? selectedPatient?.active_hmo_id : null,
        consultation_fee: consult,
        notes: form.notes || null,
        items,
        queued_at: Date.now(),
        editing_billing_id: editingBillingId,
      });
      offlineStore.save(queueKey, queue);
      toast.success("Saved offline — will sync automatically");
      resetForm();
      return;
    }

    setSaving(true);
    try {
      const isHmo = selectedPatient?.payment_type === "hmo";

      const { data: existingBill, error: billError } = await apiClient
        .from("billing")
        .select("*")
        .eq("id", editingBillingId)
        .maybeSingle();

      if (billError) {
        toast.error(billError.message);
        setSaving(false);
        return;
      }

      if (!existingBill) {
        toast.error("Billing record not found.");
        setSaving(false);
        return;
      }

      const billingId = existingBill.id;

      // Update consultation fee if changed
      if (existingBill.consultation_fee !== consult) {
        await updateConsultationFee(billingId, consult);
      }

      // Update notes and payer_type if changed
      const updatePayload: any = {};
      if (existingBill.notes !== form.notes) updatePayload.notes = form.notes || null;
      if (existingBill.payer_type !== (isHmo ? "hmo" : "private")) {
        updatePayload.payer_type = isHmo ? "hmo" : "private";
      }
      if (isHmo && existingBill.hmo_id !== selectedPatient?.active_hmo_id) {
        updatePayload.hmo_id = selectedPatient?.active_hmo_id || null;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateErr } = await apiClient
          .from("billing")
          .update(updatePayload)
          .eq("id", billingId);

        if (updateErr) {
          toast.error("Failed to update bill: " + updateErr.message);
          setSaving(false);
          return;
        }
      }

      // Insert billing items (do not update existing items, only add new ones)
      if (items.length > 0) {
        const payload = items.map(it => ({
          clinic_id: cid,
          billing_id: billingId,
          item_type: it.item_type,
          item_name: it.item_name || it.item_type,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_price: it.total_price,
        }));

        const { error: itemErr } =
          await apiClient
            .from("billing_items")
            .insert(payload as any);

        if (itemErr) {
          toast.error("Items: " + itemErr.message);
        } else {
          // deduct inventory after billing item save
          for (const it of items) {
            const name =
              (it.item_name || "").trim();

            if (!name) continue;

            const { data: stock } =
              await apiClient
                .from("inventory")
                .select("id, stock_quantity")
                .eq("clinic_id", cid)
                .ilike("name", name)
                .maybeSingle();

            if (!stock) {
              toast.error(
                `Inventory item not found: ${name}`
              );
              continue;
            }

            const currentQty =
              Number(stock.stock_quantity) || 0;

            const billedQty =
              Number(it.quantity) || 0;

            const nextQty =
              Math.max(
                currentQty - billedQty,
                0
              );

            console.log(
              "[inventory deduct]",
              {
                item: name,
                currentQty,
                billedQty,
                nextQty,
              }
            );

            const { error: stockErr } =
              await apiClient
                .from("inventory")
                .update({
                  stock_quantity: nextQty,
                })
                .eq("id", stock.id);

            if (stockErr) {
              toast.error(
                stockErr.message
              );
            }
          }
        }
      }

const { error } = await apiClient
  .from("billing")
  .update({
      consultation_fee: consult,
  })
  .eq("id", billingId);

if (error) {
    toast.error(error.message);
    setSaving(false);
    return;
}



      // Create or update HMO claim if needed
      if (isHmo && selectedPatient?.active_hmo_id) {
        // Check if claim already exists
        const { data: existingClaim } = await apiClient
          .from("hmo_claims")
          .select("id")
          .eq("billing_id", billingId)
          .maybeSingle();

        if (!existingClaim) {
          // Only insert if not already created
          await apiClient.from("hmo_claims").insert({
            clinic_id: cid,
            billing_id: billingId,
            hmo_id: selectedPatient.active_hmo_id,
            hmo_name: hmoMap.get(selectedPatient.active_hmo_id) || "",
            patient_id: form.patientId,
            service_cost: grandTotal,
            approved_amount: 0,
            co_payment: 0,
            status: "Pending",
          } as any);
        }
      }

      setSaving(false);
      toast.success("Bill updated" + (isHmo ? " & HMO claim filed" : ""));
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedLookupPatient(null);
    setLookupBills([]);
    setLookupPayments([]);
    setEditingBillingId(null);
    setForm({ patientId: "", consultationFee: "", notes: "" });
    setItems([]);
  };

  const loadBillItems = async (billingId: string) => {
    if (!cid) return;
    const { data } = await apiClient.from("billing_items").select("*").eq("clinic_id", cid).eq("billing_id", billingId);
    setBillItems(prev => ({ ...prev, [billingId]: (data || []) as any }));
  };

  const addPayment = async () => {
  if (!paymentBillingId || !paymentAmount) {
    return;
  }

  const amt = Number(paymentAmount);

  if (amt <= 0) {
    toast.error("Enter a valid amount.");
    return;
  }

  // -----------------------------
  // Load the billing record
  // -----------------------------
  const { data: bill, error: billError } =
    await apiClient
      .from("billing")
      .select("*")
      .eq("id", paymentBillingId)
      .maybeSingle();

  if (billError) {
    toast.error(billError.message);
    return;
  }

  if (!bill) {
    toast.error("Billing record not found.");
    return;
  }

  // -----------------------------
  // Save the payment
  // -----------------------------
  const { error: paymentError } =
    await apiClient
      .from("payments")
      .insert({
        billing_id: paymentBillingId,
        clinic_id: cid,
        amount: amt,
        method: paymentMethod,
        // HMO-settled amounts are recorded as paid by the HMO, not patient cash
        paid_by: paymentMethod === "HMO" ? "hmo" : "patient",
      });

  if (paymentError) {
    toast.error(paymentError.message);
    return;
  }

  // -----------------------------
  // Refresh the page
  // -----------------------------
  toast.success("Payment recorded.");

  setPaymentBillingId(null);
  setPaymentAmount("");
  setPaymentMethod("Cash");

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

  const pendingBills = bills.filter(b => {
  const total = Number(b.total_amount || 0);

  return (
    total > 0 &&
    b.status !== "paid"
  );
});

  const medicationItems =
    inventoryItems.filter(
      (item) =>
        item.category === "Eye Drop" ||
        item.category === "Drugs"
    );

  let displayBills = bills;

  if (monthFilter === "current") {
    const now = new Date();

    displayBills = bills.filter((b) => {
      const d = new Date(b.created_at);

      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    });
  }

  if (monthFilter === "previous") {
    const now = new Date();

    const prevMonth =
      now.getMonth() === 0
        ? 11
        : now.getMonth() - 1;

    const year =
      now.getMonth() === 0
        ? now.getFullYear() - 1
        : now.getFullYear();

    displayBills = bills.filter((b) => {
      const d = new Date(b.created_at);

      return (
        d.getMonth() === prevMonth &&
        d.getFullYear() === year
      );
    });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-header">Billing</h1>

        <Button
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className="rounded-xl gap-1.5"
        >
          {showForm ? (
            <>
              <X size={14} /> Cancel
            </>
          ) : (
            <>
              <Plus size={14} /> New Bill
            </>
          )}
        </Button>
      </div>

      {/* PASTE SEARCH HERE */}
      <div className="form-section mb-5">
        <Label className="text-xs">
          Search Patient Billing
        </Label>

        <Input
          className="rounded-xl mt-1"
          placeholder="Search patient..."
          value={patientSearch}
          onChange={(e) =>
            setPatientSearch(e.target.value)
          }
        />

        {filteredPatients.length > 0 && (
          <div className="mt-2 border rounded-xl divide-y">
            {filteredPatients
              .slice(0, 8)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    loadPatientBilling(p)
                  }
                  className="w-full text-left px-3 py-3 hover:bg-muted"
                >
                  <div className="font-medium">
                    {p.full_name}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {p.payment_type}
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>

      {selectedLookupPatient && (
        <div className="space-y-4 mb-5">

          <div className="form-section">
            <p className="font-semibold text-sm">
              {selectedLookupPatient.full_name}
            </p>

            <p className="text-xs text-muted-foreground">
              Payment type:
              {" "}
              {selectedLookupPatient.payment_type}
            </p>

            <Button
              size="sm"
              className="rounded-xl mt-3"
              onClick={() => {
                setForm((f) => ({
                  ...f,
                  patientId: selectedLookupPatient.id,
                }));

                setShowForm(true);
              }}
            >
              <Plus size={12} className="mr-1" />
              Add Items to Bill
            </Button>

            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">
                  Total
                </p>

                <p className="font-bold">
                  ₦{lookupTotal.toLocaleString()}
                </p>
              </div>

              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">
                  Paid
                </p>

                <p className="font-bold">
                  ₦{lookupPaid.toLocaleString()}
                </p>
              </div>

              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">
                  Balance
                </p>

                <p className="font-bold text-destructive">
                  ₦{lookupBalance.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          {lookupBills.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold">
                Previous Bills
              </p>

              {lookupBills.map((b) => (
                <div
                  key={b.id}
                  className="border rounded-xl p-3"
                >
                  <div className="flex justify-between text-sm">
                    <span>
                      ₦
                      {Number(
                        b.total_amount
                      ).toLocaleString()}
                    </span>

                    <span>
                      {b.status}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1">
                    Paid: ₦
                    {Number(
                      b.amount_paid
                    ).toLocaleString()}
                    {" • "}
                    Balance: ₦
                    {Number(
                      b.balance
                    ).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {lookupPayments.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold">
                Payments
              </p>

              {lookupPayments.map(
                (p: any) => (
                  <div
                    key={p.id}
                    className="border rounded-xl p-3 text-sm"
                  >
                    ₦
                    {Number(
                      p.amount
                    ).toLocaleString()}
                    {" • "}
                    {p.method}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="form-section mb-5 max-w-2xl animate-fade-in">
          <h2 className="section-title text-sm">Complete/Edit Bill</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Patient *</Label>
                {selectedLookupPatient &&
                  form.patientId === selectedLookupPatient.id ? (

                  <div className="rounded-xl border px-3 py-2 text-sm bg-muted/40">
                    {selectedLookupPatient.full_name}
                    {" • "}
                    {selectedLookupPatient.payment_type}
                  </div>

                ) : (

                  <Select
                    value={form.patientId}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        patientId: v,
                      }))
                    }
                  >
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.payment_type})</SelectItem>)}</SelectContent>
                  </Select>
                )}
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
                        {it.item_type === "Eye Drop" ||
                          it.item_type === "Drugs" ? (

                          <Select
                            value={it.item_name}
                            onValueChange={(value) => {

                              const selected =
                                medicationItems.find(
                                  (m) => m.name === value
                                );

                              updateItem(idx, {
                                item_name: value,
                                unit_price:
                                  Number(selected?.price) || 0,
                              });

                            }}
                          >
                            <SelectTrigger className="rounded-lg h-8 text-xs">
                              <SelectValue placeholder="Select medication" />
                            </SelectTrigger>

                            <SelectContent>
                              {medicationItems.map((m) => (
                                <SelectItem
                                  key={m.id}
                                  value={m.name}
                                >
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                        ) : (

                          <Input
                            className="rounded-lg h-8 text-xs"
                            value={it.item_name}
                            onChange={(e) =>
                              updateItem(idx, {
                                item_name: e.target.value,
                              })
                            }
                            placeholder="Item name"
                          />

                        )}
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

            <Button 
              className="rounded-xl w-full" 
              onClick={handleEditBill} 
              disabled={saving || loadingBilling || !editingBillingId}
            >
              {loadingBilling ? "Loading bill..." : saving ? "Saving..." : "Save Bill"}
            </Button>
          </div>
        </div>
      )}

      <Tabs
        defaultValue={monthFilter ? "all" : "pending"}
        className="space-y-4"
      >
        <TabsList className="bg-muted/50 rounded-2xl p-1">
          <TabsTrigger value="pending" className="rounded-xl text-xs gap-1"><DollarSign size={12} /> Pending ({pendingBills.length})</TabsTrigger>
          <TabsTrigger value="all" className="rounded-xl text-xs gap-1"><FileText size={12} /> All ({bills.length})</TabsTrigger>
          <TabsTrigger value="walk-in" className="rounded-xl text-xs gap-1"><ShoppingBag size={12} /> Walk-In Sale</TabsTrigger>
        </TabsList>

        <TabsContent value="walk-in">
          <WalkInSale />
        </TabsContent>

        {[
          { value: "pending", list: pendingBills },
          { value: "all", list: displayBills },
        ].map(tab => (
          <TabsContent key={tab.value} value={tab.value}>
            {loading ? (
              <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>
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
