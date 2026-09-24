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
import { DollarSign, FileText, Plus, X, Printer, Trash2, ShoppingBag, Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAccess } from "@/hooks/useAccess";
import { offlineStore } from "@/lib/offlineStore";
import { useOffline } from "@/hooks/useOffline";
import { enqueueOfflineOperation } from "@/lib/offlineEngine";
import { confirmDestructiveAction } from "@/lib/safeDelete";
import WalkInSale from "@/components/billing/WalkInSale";
const PAYMENT_METHODS = ["Cash", "Card", "Transfer", "HMO"];
const ITEM_TYPES = ["Lens", "Lens Transfer", "Frame", "Frame Fixing", "Contact Lens", "Eye Drop", "Drugs", "Accessories", "Others"];

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
  family_id?: string | null;
  billing_scope?: string;
  discount_amount?: number;
  discount_reason?: string | null;
}

interface BillItem {
  id?: string;
  inventory_id?: string | null;
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
  family_id?: string | null;
}

interface LookupBillDetail {
  items: any[];
  visit: any | null;
  medicationDispensing: any[];
}

function parsePrescribedMedicationNames(medication: string | null | undefined): string[] {
  if (!medication) return [];
  return medication
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("—")[0].trim())
    .filter(Boolean);
}

function normalizeBillingName(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function StockItemPicker({
  value,
  items,
  onSelect,
  placeholder = "Select item from stock",
}: {
  value?: string | null;
  items: any[];
  onSelect: (item: any) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((item) => item.id === value);
  const available = items.filter((item) => Number(item.stock_quantity ?? 0) > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between rounded-lg h-8 px-2.5 text-xs font-normal"
        >
          <span className={selected ? "truncate text-foreground" : "truncate text-muted-foreground"}>
            {selected?.name || placeholder}
          </span>
          <ChevronsUpDown size={13} className="ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-32px))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search stock by item name or category..." />
          <CommandList>
            <CommandEmpty>No available stock matches your search.</CommandEmpty>
            <CommandGroup heading={available.length ? `${available.length} items in stock` : "Stock"}>
              {available.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.category || ""} ${item.item_type || ""}`}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  className="py-2.5"
                >
                  <Check
                    size={14}
                    className={value === item.id ? "mr-2 opacity-100 text-primary" : "mr-2 opacity-0"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {item.category || item.item_type || "Stock item"} · Stock {Number(item.stock_quantity) || 0} · ₦{Number(item.price) || 0}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Billing() {
  const { effectiveClinicId: cid, user, role } = useAccess();
  const canApplyDiscount = role === "admin" || role === "super_admin" || role === "receptionist";
  const [searchParams] = useSearchParams();

  const monthFilter =
    searchParams.get("month");
  const patientContext = Boolean(searchParams.get("patient_id"));
  const visitContext = searchParams.get("visit_id");
  const { isOffline } = useOffline();
  const [bills, setBills] = useState<BillingRow[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hmoMap, setHmoMap] = useState<Map<string, string>>(new Map());
  const [familyMap, setFamilyMap] = useState<Map<string, any>>(new Map());
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
    discountAmount: "",
    discountReason: "",
    billingScope: "individual",
    familyId: "",
  });
  const [items, setItems] = useState<BillItem[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedLookupPatient, setSelectedLookupPatient] =
    useState<Patient | null>(null);

  const [lookupBills, setLookupBills] =
    useState<BillingRow[]>([]);

  const [lookupPayments, setLookupPayments] =
    useState<any[]>([]);

  const [lookupBillDetails, setLookupBillDetails] =
    useState<Record<string, LookupBillDetail>>({});

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
        inventoryRes,
        familyRes,
      ] = await Promise.all([
        apiClient.from("billing")
          .select("*")
          .eq("clinic_id", cid)
          .order("created_at", { ascending: false })
          .limit(100),

        apiClient.from("patients")
          .select("id, full_name, payment_type, active_hmo_id, family_id")
          .eq("clinic_id", cid)
          .order("full_name"),

        apiClient.from("hmos")
          .select("id, name")
          .eq("clinic_id", cid),

        apiClient.from("inventory")
          .select("*")
          .eq("clinic_id", cid),
        apiClient.from("families")
          .select("id, family_number, family_name")
          .eq("clinic_id", cid)
          .order("family_name")
      ]);
      if (billRes.error && patRes.error) { hydrateFromCache(); return; }
      console.debug("[billing]", { clinic_id: cid, bills: billRes.data?.length ?? 0 });
      const hmosList = (hmoRes.data || []) as Array<{ id: string; name: string }>;
      const familiesList = (familyRes.data || []) as any[];
      setFamilyMap(new Map(familiesList.map((f: any) => [f.id, f])));
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
    patient: Patient,
    targetVisitId?: string | null
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

      const billingIds = (billsRes || []).map((b) => b.id);
      const visitIds = (billsRes || [])
        .map((b) => b.visit_id)
        .filter(Boolean) as string[];

      const [
        paymentsResult,
        visitsResult,
        billingItemsResult,
        medicationDispensingResult,
        hmoClaimsResult,
      ] = billingIds.length
        ? await Promise.all([
            apiClient
              .from("payments")
              .select("*")
              .in("billing_id", billingIds),
            visitIds.length
              ? apiClient
                  .from("visits")
                  .select(
                    "id, lens_type, medication, optical_dispensed, optical_dispensed_at, medication_dispensed, medication_dispensed_at"
                  )
                  .in("id", visitIds)
              : Promise.resolve({ data: [], error: null }),
            apiClient
              .from("billing_items")
              .select(
                "billing_id, item_name, item_type, quantity, unit_price, total_price, inventory_id"
              )
              .eq("clinic_id", cid)
              .in("billing_id", billingIds)
              .order("created_at", { ascending: true }),
            visitIds.length
              ? apiClient
                  .from("visit_medication_dispensing")
                  .select(
                    "visit_id, medication_name, dispensed, dispensed_at, dispensed_by"
                  )
                  .in("visit_id", visitIds)
              : Promise.resolve({ data: [], error: null }),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];

      const paymentsRes = paymentsResult.data || [];
      const visitRows = visitsResult.data || [];
      const billingItemRows = billingItemsResult.data || [];
      const medicationDispensingRows = medicationDispensingResult.data || [];
      const visitMap = new Map(
        (visitRows as any[]).map((visit) => [visit.id, visit])
      );

      const detailMap: Record<string, LookupBillDetail> = {};
      (billsRes || []).forEach((bill: any) => {
        const billVisit = bill.visit_id
          ? visitMap.get(bill.visit_id) || null
          : null;

        detailMap[bill.id] = {
          items: billingItemRows.filter(
            (item: any) => item.billing_id === bill.id
          ),
          visit: billVisit,
          medicationDispensing: billVisit
            ? medicationDispensingRows.filter(
                (item: any) => item.visit_id === billVisit.id
              )
            : [],
        };
      });

      // Keep zero-value billing placeholders available internally so a new bill
      // can still be opened and edited, but do not expose those placeholders as
      // actual billing history.
      const actualLookupBills = (billsRes || []).filter(
        (bill: any) =>
          Number(bill.consultation_fee || 0) > 0 ||
          Number(bill.items_total || 0) > 0 ||
          Number(bill.total_amount || 0) > 0 ||
          Number(bill.amount_paid || 0) > 0
      );

      setLookupBills(actualLookupBills as BillingRow[]);
      setLookupBillDetails(detailMap);

      // Select from all billing records so a zero-value placeholder can still
      // be used to create the patient's first real bill.
const selectedBill = targetVisitId
  ? (billsRes.find((b) => b.visit_id === targetVisitId) ?? null)
  : (billsRes.find((b) => Number(b.total_amount || 0) > 0 && b.status !== "paid") ??
     billsRes.find((b) => Number(b.total_amount || 0) > 0) ??
     billsRes[0]);

if (!selectedBill) {
  setEditingBillingId(null);
  return;
}

setEditingBillingId(selectedBill.id);

      const { data: selectedItems, error: selectedItemsError } = await apiClient
        .from("billing_items")
        .select("*")
        .eq("clinic_id", cid)
        .eq("billing_id", selectedBill.id)
        .order("created_at", { ascending: true });

      if (selectedItemsError) {
        console.error("Billing items query error:", selectedItemsError);
      }

      setItems((selectedItems || []).map((it: any) => ({
        id: it.id,
        inventory_id: it.inventory_id || null,
        item_type: it.item_type,
        item_name: it.item_name,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        total_price: Number(it.total_price) || 0,
      })));

      setForm((f) => ({
        ...f,
        consultationFee: String(Number(selectedBill.consultation_fee) || 0),
        notes: selectedBill.notes || "",
        discountAmount: String(Number((selectedBill as any).discount_amount) || 0),
        discountReason: (selectedBill as any).discount_reason || "",
        billingScope: (selectedBill as any).billing_scope || "individual",
        familyId: (selectedBill as any).family_id || patient.family_id || "",
      }));

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

  useEffect(() => {
    if (!cid || patients.length === 0) return;
    const patientId = searchParams.get("patient_id");
    const visitId = searchParams.get("visit_id");
    if (!patientId) return;
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    loadPatientBilling(patient, visitId);
  }, [cid, patients, searchParams]);

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

  const addItem = () =>
  setItems([
    ...items,
    {
      item_type: "Lens",
      item_name: "",
      inventory_id: null,
      quantity: 1,
      unit_price: 0,
      total_price: 0,
    },
  ]);
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
  const discount = Math.max(0, Math.min(Number(form.discountAmount) || 0, itemsTotal + consult));
  const grandTotal = Math.max(0, itemsTotal + consult - discount);

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
      const isHmoQ = selectedPatient?.payment_type === "hmo";
      const queuedItems = items.map((it) => ({
        id: it.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "billing-item-" + Date.now() + "-" + Math.random().toString(36).slice(2)),
        clinic_id: cid,
        billing_id: editingBillingId,
        inventory_id: it.inventory_id || null,
        item_type: it.item_type,
        item_name: it.item_name || it.item_type,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        total_price: Number(it.total_price) || 0,
      }));
      await enqueueOfflineOperation({
        clinicId: cid,
        userId: user?.id ?? null,
        kind: "billing.save",
        entityId: editingBillingId,
        payload: {
          clinic_id: cid,
          patient_id: form.patientId,
          payer_type: isHmoQ ? "hmo" : "private",
          hmo_id: isHmoQ ? selectedPatient?.active_hmo_id : null,
          consultation_fee: consult,
          discount_amount: canApplyDiscount ? discount : 0,
          discount_reason: canApplyDiscount ? (form.discountReason.trim() || null) : null,
          discount_applied_by: canApplyDiscount && discount > 0 ? (user?.id || null) : null,
          billing_scope: form.billingScope,
          family_id: form.billingScope === "family" ? (form.familyId || selectedPatient?.family_id || null) : null,
          notes: form.notes || null,
          items: queuedItems,
          queued_at: Date.now(),
          editing_billing_id: editingBillingId,
        },
      });
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
        .eq("clinic_id", cid)
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
      if (canApplyDiscount) {
        updatePayload.discount_amount = discount;
        updatePayload.discount_reason = form.discountReason.trim() || null;
        updatePayload.discount_applied_by = discount > 0 ? (user?.id || null) : null;
      }
      updatePayload.billing_scope = form.billingScope;
      updatePayload.family_id = form.billingScope === "family" ? (form.familyId || selectedPatient?.family_id || null) : null;
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

      // Synchronize billing line items without duplicating existing rows.
      // Billing records the charge only; inventory is NOT deducted here.
      const { data: existingItems, error: existingItemsError } = await apiClient
        .from("billing_items")
        .select("id")
        .eq("clinic_id", cid)
        .eq("billing_id", billingId);

      if (existingItemsError) {
        toast.error("Items: " + existingItemsError.message);
        setSaving(false);
        return;
      }

      const existingItemIds = new Set((existingItems || []).map((it: any) => it.id));
      const currentItemIds = new Set(items.map((it) => it.id).filter(Boolean) as string[]);
      const removedItemIds = [...existingItemIds].filter((id) => !currentItemIds.has(id));

      if (removedItemIds.length > 0) {
        const { error: deleteErr } = await apiClient
          .from("billing_items")
          .delete()
          .eq("clinic_id", cid)
          .eq("billing_id", billingId)
          .in("id", removedItemIds);

        if (deleteErr) {
          toast.error("Items: " + deleteErr.message);
          setSaving(false);
          return;
        }
      }

      for (const it of items.filter((it) => it.id && existingItemIds.has(it.id))) {
        const { error: updateItemErr } = await apiClient
          .from("billing_items")
          .update({
            inventory_id: it.inventory_id || null,
            item_type: it.item_type,
            item_name: it.item_name || it.item_type,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            total_price: Number(it.total_price) || 0,
          })
          .eq("id", it.id)
          .eq("clinic_id", cid)
          .eq("billing_id", billingId);

        if (updateItemErr) {
          toast.error("Items: " + updateItemErr.message);
          setSaving(false);
          return;
        }
      }

      const newItems = items.filter((it) => !it.id);
      if (newItems.length > 0) {
        const payload = newItems.map(it => ({
          clinic_id: cid,
          billing_id: billingId,
          inventory_id: it.inventory_id || null,
          item_type: it.item_type,
          item_name: it.item_name || it.item_type,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || 0,
        }));

        const { error: itemErr } = await apiClient
          .from("billing_items")
          .insert(payload as any);

        if (itemErr) {
          toast.error("Items: " + itemErr.message);
          setSaving(false);
          return;
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
    setLookupBillDetails({});
    setEditingBillingId(null);
    setForm({ patientId: "", consultationFee: "", notes: "", discountAmount: "", discountReason: "", billingScope: "individual", familyId: "" });
    setItems([]);
  };

  const loadBillItems = async (billingId: string) => {
    if (!cid) return;
    const { data } = await apiClient.from("billing_items").select("*").eq("clinic_id", cid).eq("billing_id", billingId);
    setBillItems(prev => ({ ...prev, [billingId]: (data || []) as any }));
  };

  const addPayment = async () => {
  if (!cid) {
    toast.error("No active clinic");
    return;
  }
  if (!paymentBillingId || !paymentAmount) {
    return;
  }

  const amt = Number(paymentAmount);

  if (amt <= 0) {
    toast.error("Enter a valid amount.");
    return;
  }

  const offline = isOffline || (typeof navigator !== "undefined" && !navigator.onLine);
  if (offline) {
    const bill = bills.find((b) => b.id === paymentBillingId);
    if (!bill) {
      toast.error("Billing record is not available offline.");
      return;
    }
    const outstandingBalance = Math.max(0, Number(bill.total_amount || 0) - Number(bill.amount_paid || 0));
    if (amt > outstandingBalance) {
      toast.error("Payment cannot exceed the outstanding balance of ₦" + outstandingBalance.toLocaleString() + ".");
      return;
    }
    const paymentId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "payment-" + Date.now();
    await enqueueOfflineOperation({
      clinicId: cid,
      userId: user?.id ?? null,
      kind: "payment.create",
      entityId: paymentId,
      payload: {
        id: paymentId,
        billing_id: paymentBillingId,
        amount: amt,
        method: paymentMethod,
        paid_by: paymentMethod === "HMO" ? "hmo" : "patient",
        received_by: user?.id ?? null,
      },
    });
    const nextPaid = Number(bill.amount_paid || 0) + amt;
    const nextBalance = Math.max(Number(bill.total_amount || 0) - nextPaid, 0);
    const nextStatus = nextBalance <= 0 ? "paid" : "partial";
    const nextBills = bills.map((row) => row.id === bill.id ? { ...row, amount_paid: nextPaid, balance: nextBalance, status: nextStatus } : row);
    setBills(nextBills);
    offlineStore.save("bills:" + cid, nextBills);
    toast.success("Payment saved offline — it will sync automatically.");
    setPaymentBillingId(null);
    setPaymentAmount("");
    setPaymentMethod("Cash");
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
      .eq("clinic_id", cid)
      .maybeSingle();

  if (billError) {
    toast.error(billError.message);
    return;
  }

  if (!bill) {
    toast.error("Billing record not found.");
    return;
  }

  const outstandingBalance = Math.max(
    0,
    Number(bill.total_amount || 0) - Number(bill.amount_paid || 0)
  );

  if (amt > outstandingBalance) {
    toast.error(
      "Payment cannot exceed the outstanding balance of ₦" +
      outstandingBalance.toLocaleString() +
      "."
    );
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
    received_by: user?.id ?? null,
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

  // ensureBillingForVisit creates zero-value billing placeholders for visits.
  // They are useful internally for editing a bill, but they are not actual bills
  // and should never appear in billing lists or patient billing history.
  const actualBills = bills.filter(
    (b) =>
      Number(b.consultation_fee || 0) > 0 ||
      Number(b.items_total || 0) > 0 ||
      Number(b.total_amount || 0) > 0 ||
      Number(b.amount_paid || 0) > 0
  );

  let displayBills = actualBills;

  if (monthFilter === "current") {
    const now = new Date();

    displayBills = actualBills.filter((b) => {
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

    displayBills = actualBills.filter((b) => {
      const d = new Date(b.created_at);

      return (
        d.getMonth() === prevMonth &&
        d.getFullYear() === year
      );
    });
  }

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="page-header">
              {patientContext ? "Patient Billing" : "Billing & Payments"}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {patientContext
                ? "Review this patient's bills, payments and visit charges."
                : "Manage patient charges, payments and outstanding balances."}
            </p>
          </div>
          {showForm && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              className="rounded-xl gap-1.5 shrink-0"
            >
              <X size={14} /> Close
            </Button>
          )}
        </div>
      </div>

      {!patientContext && (
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
      )}

      {selectedLookupPatient && (
        <div className="space-y-4 mb-5">

          <div className="form-section">
            <p className="font-semibold text-sm">
              {selectedLookupPatient.full_name}
            </p>

            <p className="text-xs text-muted-foreground">
              Payment type: {selectedLookupPatient.payment_type}
            </p>
            {visitContext && (
              <p className="text-[11px] text-primary font-medium mt-1">
                Billing for the selected visit
              </p>
            )}

            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <FileText size={13} />
              {loadingBilling
                ? "Loading billing details…"
                : editingBillingId
                  ? "Billing record ready for review or update."
                  : "No billing record is currently available for this patient."}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-muted/40 border border-border/50 rounded-xl p-3 text-center">
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
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold">
                {visitContext ? "Patient Payment History" : "Previous Bills"}
              </p>

              {lookupBills.map((b) => {
                const detail = lookupBillDetails[b.id];
                const billItems = detail?.items || [];
                const visit = detail?.visit || null;
                const prescribedMedicationNames = parsePrescribedMedicationNames(
                  visit?.medication
                );
                const medicationDispensing = detail?.medicationDispensing || [];
                const findInventoryItem = (item: any) => {
                  if (item.inventory_id) {
                    const byId = inventoryItems.find(
                      (inventory) => inventory.id === item.inventory_id
                    );
                    if (byId) return byId;
                  }

                  const itemName = normalizeBillingName(item.item_name);
                  return inventoryItems.find(
                    (inventory) =>
                      normalizeBillingName(inventory.name) === itemName
                  );
                };

                const getItemStatus = (item: any) => {
                  const itemName = normalizeBillingName(item.item_name);
                  const prescribedName = prescribedMedicationNames.find(
                    (name) => {
                      const normalized = normalizeBillingName(name);
                      return (
                        normalized === itemName ||
                        normalized.includes(itemName) ||
                        itemName.includes(normalized)
                      );
                    }
                  );

                  const dispensing = medicationDispensing.find(
                    (record: any) =>
                      normalizeBillingName(record.medication_name) ===
                      itemName
                  );

                  const inventory = findInventoryItem(item);
                  const isMedication =
                    item.item_type === "Eye Drop" ||
                    item.item_type === "Drugs" ||
                    Boolean(prescribedName);

                  if (isMedication) {
                    if (dispensing?.dispensed === true) {
                      return {
                        label: "Dispensed",
                        className: "text-success",
                      };
                    }

                    if (
                      inventory &&
                      Number(inventory.stock_quantity ?? 0) > 0
                    ) {
                      return {
                        label:
                          "Not yet dispensed • In stock • " +
                          Number(inventory.stock_quantity) +
                          " available",
                        className: "text-primary",
                      };
                    }

                    if (prescribedName) {
                      return {
                        label: "Prescribed • Not in stock",
                        className: "text-warning",
                      };
                    }

                    return {
                      label: "Not in stock",
                      className: "text-warning",
                    };
                  }

                  if (
                    (item.item_type === "Lens" ||
                      item.item_type === "Frame" ||
                      item.item_type === "Contact Lens") &&
                    visit
                  ) {
                    return {
                      label:
                        visit.optical_dispensed === true
                          ? "Dispensed"
                          : "Not yet dispensed",
                      className:
                        visit.optical_dispensed === true
                          ? "text-success"
                          : "text-warning",
                    };
                  }

                  return null;
                };

                const paymentsForBill = lookupPayments.filter(
                  (payment: any) => payment.billing_id === b.id
                );

                return (
                  <div
                    key={b.id}
                    className="border rounded-2xl p-3.5 bg-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {new Date(b.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Invoice {b.id.slice(0, 8).toUpperCase()}
                        </p>
                      </div>

                      <span className="shrink-0 text-[10px] px-2 py-1 rounded-md bg-muted uppercase font-medium">
                        {b.status}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {Number(b.consultation_fee || 0) > 0 && (
                        <div className="flex items-start justify-between gap-3 text-xs">
                          <div>
                            <p className="font-medium">{b.billing_scope === "family" ? "Family consultation" : "Consultation"}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Clinical consultation
                            </p>
                          </div>
                          <span className="font-medium shrink-0">
                            ₦{Number(b.consultation_fee).toLocaleString()}
                          </span>
                        </div>
                      )}

                      {billItems.map((item: any, index: number) => {
                        const itemStatus = getItemStatus(item);

                        return (
                          <div
                            key={
                              b.id +
                              "-" +
                              (item.inventory_id || item.item_name) +
                              "-" +
                              index
                            }
                            className="flex items-start justify-between gap-3 rounded-xl bg-muted/30 px-2.5 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium">
                                {item.item_name || item.item_type}
                                {Number(item.quantity || 1) > 1
                                  ? " × " + Number(item.quantity)
                                  : ""}
                              </p>

                              <p className="text-[10px] text-muted-foreground">
                                {item.item_type}
                              </p>

                              {item.item_type === "Lens" && visit?.lens_type && (
                                <p className="text-[10px] text-primary font-medium mt-0.5">
                                  Lens type: {visit.lens_type}
                                </p>
                              )}

                              {itemStatus && (
                                <p
                                  className={
                                    "text-[10px] font-medium mt-0.5 " +
                                    itemStatus.className
                                  }
                                >
                                  {itemStatus.label}
                                </p>
                              )}
                            </div>

                            <span className="text-xs font-medium shrink-0">
                              ₦{Number(item.total_price || 0).toLocaleString()}
                            </span>
                          </div>
                        );
                      })}

                      {prescribedMedicationNames.length > 0 && (
                        <div className="mt-2 rounded-xl border border-dashed px-2.5 py-2">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                            Prescribed medication
                          </p>

                          {prescribedMedicationNames.map((prescribedName, index) => {
                            const normalizedPrescription =
                              normalizeBillingName(prescribedName);

                            const inventoryMatch = inventoryItems.find((inventory) => {
                              const inventoryName = normalizeBillingName(inventory.name);
                              return (
                                inventoryName === normalizedPrescription ||
                                inventoryName.includes(normalizedPrescription) ||
                                normalizedPrescription.includes(inventoryName)
                              );
                            });

                            const displayName =
                              inventoryMatch?.name || prescribedName;

                            const dispensing = medicationDispensing.find(
                              (record: any) =>
                                normalizeBillingName(record.medication_name) ===
                                normalizedPrescription
                            );

                            const isBilled = billItems.some(
                              (item: any) => {
                                const itemName = normalizeBillingName(item.item_name);
                                return (
                                  itemName === normalizedPrescription ||
                                  itemName.includes(normalizedPrescription) ||
                                  normalizedPrescription.includes(itemName)
                                );
                              }
                            );

                            if (isBilled) return null;

                            return (
                              <div
                                key={prescribedName + "-" + index}
                                className="flex items-start justify-between gap-3 py-1.5"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-medium">
                                    {displayName}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Eye Drop / prescribed medication
                                  </p>

                                  {dispensing?.dispensed === true ? (
                                    <p className="text-[10px] font-medium mt-0.5 text-success">
                                      Dispensed
                                    </p>
                                  ) : inventoryMatch &&
                                    Number(inventoryMatch.stock_quantity ?? 0) > 0 ? (
                                    <p className="text-[10px] font-medium mt-0.5 text-primary">
                                      Prescribed • In stock •{" "}
                                      {Number(inventoryMatch.stock_quantity)} available
                                    </p>
                                  ) : (
                                    <p className="text-[10px] font-medium mt-0.5 text-warning">
                                      Prescribed • Not in stock
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {Number((b as any).discount_amount || 0) > 0 && (
                        <div className="flex justify-between gap-3 text-xs text-success">
                          <span>Discount</span>
                          <span>-₦{Number((b as any).discount_amount).toLocaleString()}</span>
                        </div>
                      )}

                      {billItems.length === 0 && Number(b.consultation_fee || 0) === 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          No bill items recorded for this bill.
                        </p>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t text-xs space-y-1">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-semibold">
                          ₦{Number(b.total_amount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="font-medium">
                          ₦{Number(b.amount_paid).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Balance</span>
                        <span className={
                          "font-medium " +
                          (Number(b.balance) > 0 ? "text-warning" : "text-success")
                        }>
                          ₦{Number(b.balance).toLocaleString()}
                        </span>
                      </div>

                      {paymentsForBill.length > 0 && (
                        <p className="text-[10px] text-muted-foreground pt-1">
                          Payment:{" "}
                          {paymentsForBill
                            .map(
                              (payment: any) =>
                                payment.method +
                                " ₦" +
                                Number(payment.amount).toLocaleString()
                            )
                            .join(" • ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
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
          <h2 className="section-title text-sm">
            {visitContext ? "Bill for This Visit" : "Billing Details"}
          </h2>
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
                <Label className="text-xs">{form.billingScope === "family" ? "Family Consultation Fee (₦)" : "Consultation Fee (₦)"}</Label>
                <Input className="rounded-xl" type="number" min={0} value={form.consultationFee} onChange={e => setForm(f => ({ ...f, consultationFee: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Billing Scope</Label>
                <Select value={form.billingScope} onValueChange={v => setForm(f => ({ ...f, billingScope: v, familyId: v === "family" ? (f.familyId || selectedPatient?.family_id || "") : "" }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="family" disabled={!selectedPatient?.family_id}>Family</SelectItem>
                  </SelectContent>
                </Select>
                {form.billingScope === "family" && <p className="text-[10px] text-primary font-medium">{familyMap.get(form.familyId || selectedPatient?.family_id || "")?.family_name || "Family"}</p>}
              </div>
              {canApplyDiscount && (
                <div className="space-y-1">
                  <Label className="text-xs">Discount (₦)</Label>
                  <Input className="rounded-xl" type="number" min={0} max={itemsTotal + consult} value={form.discountAmount} onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value }))} placeholder="0" />
                </div>
              )}
              {canApplyDiscount && discount > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Discount Reason</Label>
                  <Input className="rounded-xl" value={form.discountReason} onChange={e => setForm(f => ({ ...f, discountReason: e.target.value }))} placeholder="e.g. Family discount" />
                </div>
              )}
            </div>

            <div className="border-t border-border/60 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold">Billable Items</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Add lenses, frames, medication, services or other charges.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl gap-1.5 shrink-0"
                  onClick={addItem}
                >
                  <Plus size={12} /> Add billable
                </Button>
              </div>
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/20 px-3 py-5 text-center">
                  <FileText size={18} className="mx-auto text-muted-foreground mb-1.5" />
                  <p className="text-[11px] font-medium text-foreground">No billable items yet</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Use “Add billable” above to add products or services.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5 items-end border rounded-xl bg-card p-3 shadow-sm">
                      <div className="col-span-3">
                        <Label className="text-[10px]">Type</Label>
                        <Select
  value={it.item_type}
  onValueChange={v =>
    updateItem(idx, {
      item_type: v,
      inventory_id: null,
      item_name: "",
      unit_price: 0,
    })
  }
>
                          <SelectTrigger className="rounded-lg h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <Label className="text-[10px]">Name</Label>
                        {it.item_type === "Lens Transfer" ||
                        it.item_type === "Frame Fixing" ||
                        it.item_type === "Others" ? (
                          <Input
                            className="rounded-lg h-8 text-xs"
                            value={it.item_name}
                            onChange={(e) =>
                              updateItem(idx, {
                                item_name: e.target.value,
                                inventory_id: null,
                              })
                            }
                            placeholder={
                              it.item_type === "Lens Transfer"
                                ? "Describe transferred lens"
                                : it.item_type === "Frame Fixing"
                                  ? "Describe frame repair/fixing"
                                  : "Enter custom charge"
                            }
                          />
                        ) : (
                          <StockItemPicker
                            value={it.inventory_id}
                            items={inventoryItems}
                            placeholder="Select exact item from stock"
                            onSelect={(selected) => {
                              const rawType = String(selected.item_type || selected.category || "").trim();
                              const matchedType = ITEM_TYPES.find(
                                (type) => type.toLowerCase() === rawType.toLowerCase()
                              );
                              updateItem(idx, {
                                inventory_id: selected.id,
                                item_name: selected.name || "",
                                unit_price: Number(selected.price) || 0,
                                ...(matchedType ? { item_type: matchedType } : {}),
                              });
                            }}
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

            <div className="bg-muted/50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div><p className="text-[10px] text-muted-foreground">Items</p><p className="text-sm font-bold">₦{itemsTotal.toLocaleString()}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Consultation</p><p className="text-sm font-bold">₦{consult.toLocaleString()}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Discount</p><p className="text-sm font-bold text-success">-₦{discount.toLocaleString()}</p></div>
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

      {!patientContext && (
      <Tabs
        defaultValue={monthFilter ? "all" : "pending"}
        className="space-y-4"
      >
        <TabsList className="bg-muted/50 rounded-2xl p-1">
          <TabsTrigger value="pending" className="rounded-xl text-xs gap-1"><DollarSign size={12} /> Pending ({pendingBills.length})</TabsTrigger>
          <TabsTrigger value="all" className="rounded-xl text-xs gap-1"><FileText size={12} /> All ({actualBills.length})</TabsTrigger>
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
      )}
    </>
  );
}