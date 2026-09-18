import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShoppingBag, Plus, Trash2, Printer, Mail, Search, Receipt } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";
import OptoLoader from "@/components/OptoLoader";

const PAYMENT_METHODS = ["Cash", "POS", "Transfer", "HMO"];

interface InvItem {
  id: string;
  name: string;
  category: string;
  price: number;
  stock_quantity: number;
}

interface Line {
  inventory_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  available_stock: number;
  isTransfer?: boolean;
}

interface WalkInSaleRow {
  id: string;
  created_at: string;
  receipt_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  payment_method: string | null;
  notes: string | null;
}

interface ReceiptLine {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

function makeReceiptNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WI-${stamp}-${rand}`;
}

function receiptHtml(sale: WalkInSaleRow, lines: ReceiptLine[], clinicName: string) {
  const rows = lines
    .map(
      (l) =>
        `<div class="row"><span>${l.name} × ${l.quantity}</span><span>₦${Number(l.total_price).toLocaleString()}</span></div>`,
    )
    .join("");
  return `
    <html><head><title>Walk-In Receipt ${sale.receipt_number || ""}</title><style>
      body{font-family:sans-serif;padding:20px;max-width:420px;margin:auto;color:#111}
      h2{text-align:center;margin:0}hr{border:0;border-top:1px dashed #ccc;margin:10px 0}
      .row{display:flex;justify-content:space-between;margin:4px 0;font-size:13px}
      .total{font-weight:bold;font-size:15px}
      .tag{text-align:center;font-size:11px;letter-spacing:1px;font-weight:bold;color:#0b5ea8}
    </style></head><body>
      <h2>${clinicName}</h2>
      <p class="tag">WALK-IN SALE</p>
      <p style="text-align:center;font-size:12px;color:#666">${new Date(sale.created_at).toLocaleString()}</p>
      <hr/>
      <div class="row"><span>Receipt No.</span><span>${sale.receipt_number || "—"}</span></div>
      <div class="row"><span>Customer</span><span>${sale.customer_name || "Walk-In Customer"}</span></div>
      ${sale.customer_phone ? `<div class="row"><span>Phone</span><span>${sale.customer_phone}</span></div>` : ""}
      <hr/>
      ${rows}
      <hr/>
      <div class="row"><span>Subtotal</span><span>₦${Number(sale.subtotal).toLocaleString()}</span></div>
      ${Number(sale.discount_amount) > 0 ? `<div class="row"><span>Discount</span><span>-₦${Number(sale.discount_amount).toLocaleString()}</span></div>` : ""}
      <div class="row total"><span>Total</span><span>₦${Number(sale.total_amount).toLocaleString()}</span></div>
      <div class="row"><span>Paid (${sale.payment_method || "Cash"})</span><span>₦${Number(sale.amount_paid).toLocaleString()}</span></div>
      <div class="row"><span>Change / Balance</span><span>₦${(Number(sale.amount_paid) - Number(sale.total_amount)).toLocaleString()}</span></div>
      <hr/>
      <p style="text-align:center;font-size:11px;color:#999">No consultation or patient record is attached to this sale.<br/>Thank you.</p>
    </body></html>`;
}

export default function WalkInSale() {
  const { effectiveClinicId: cid, user, role } = useAccess();
  const canDiscount = role === "admin" || role === "super_admin";

  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [sales, setSales] = useState<WalkInSaleRow[]>([]);
  const [clinicName, setClinicName] = useState("OptoCare EMR");
  const [emailingId, setEmailingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cid) { setItems([]); setSales([]); setLoading(false); return; }
    setLoading(true);
    const [invRes, salesRes, clinicRes] = await Promise.all([
      apiClient.from("inventory").select("id,name,category,price,stock_quantity").eq("clinic_id", cid).order("name"),
      apiClient.from("inventory_sales").select("*").eq("clinic_id", cid).eq("sale_type", "walk_in").order("created_at", { ascending: false }).limit(50),
      apiClient.from("clinics").select("name").eq("id", cid).maybeSingle(),
    ]);
    setItems(((invRes.data as any[]) || []) as InvItem[]);
    setSales(((salesRes.data as any[]) || []) as WalkInSaleRow[]);
    if ((clinicRes.data as any)?.name) setClinicName((clinicRes.data as any).name);
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const subtotal = useMemo(() => lines.reduce((a, l) => a + l.quantity * l.unit_price, 0), [lines]);
  const discountValue = canDiscount ? Math.min(Math.max(parseFloat(discount) || 0, 0), subtotal) : 0;
  const total = Math.max(subtotal - discountValue, 0);

  const addLine = (item: InvItem) => {
    if (item.stock_quantity < 1) { toast.error(`${item.name} is out of stock`); return; }
    setLines((prev) => {
      const existing = prev.find((l) => l.inventory_id === item.id);
      if (existing) {
        if (existing.quantity >= item.stock_quantity) { toast.error("Not enough stock"); return prev; }
        return prev.map((l) => l.inventory_id === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, { inventory_id: item.id, name: item.name, quantity: 1, unit_price: Number(item.price) || 0, available_stock: item.stock_quantity }];
    });
  };

  const addLensTransfer = () => {
    setLines((prev) => [
      ...prev,
      {
        inventory_id: null,
        name: "Lens Transfer",
        quantity: 1,
        unit_price: 0,
        available_stock: 0,
        isTransfer: true,
      },
    ]);
  };

  const updateLine = (id: string | null, patch: Partial<Line>, index?: number) =>
    setLines((prev) => prev.map((l, i) =>
      (index !== undefined ? i === index : l.inventory_id === id) ? { ...l, ...patch } : l
    ));

  const resetForm = () => {
    setLines([]); setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
    setDiscount(""); setAmountPaid(""); setNotes(""); setPaymentMethod("Cash");
  };

  const printReceipt = async (sale: WalkInSaleRow, preloaded?: ReceiptLine[]) => {
    let rlines = preloaded;
    if (!rlines) {
      const { data } = await apiClient
        .from("inventory_sale_items")
        .select("quantity,unit_price,total_price,inventory_id,item_name,inventory:inventory(name)")
        .eq("sale_id", sale.id);
      rlines = ((data as any[]) || []).map((r) => ({
        name: r.item_name || r.inventory?.name || "Item",
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        total_price: Number(r.total_price) || 0,
      }));
    }
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup blocked — allow popups to print"); return; }
    w.document.write(receiptHtml(sale, rlines, clinicName));
    w.document.close();
    w.print();
  };

  const emailReceipt = async (sale: WalkInSaleRow, overrideEmail?: string) => {
    const to = overrideEmail || sale.customer_email;
    if (!to) { toast.error("No customer email on this sale"); return; }
    setEmailingId(sale.id);
    try {
      const { data, error } = await apiClient.functions.invoke("send-walkin-receipt", {
        body: { sale_id: sale.id, to },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(`Receipt emailed to ${to}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to email receipt");
    } finally {
      setEmailingId(null);
    }
  };

  const completeSale = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    if (lines.length === 0) { toast.error("Add at least one item"); return; }
    if (lines.some((l) => l.quantity < 1)) { toast.error("Quantity must be at least 1"); return; }
    const overStock = lines.find((l) => l.quantity > l.available_stock);
    if (overStock) { toast.error(`Only ${overStock.available_stock} left of ${overStock.name}`); return; }

    const paid = amountPaid === "" ? total : Math.max(parseFloat(amountPaid) || 0, 0);
    setSaving(true);
    try {
      const receiptNumber = makeReceiptNumber();
      const { data: sale, error } = await apiClient
        .from("inventory_sales")
        .insert({
          clinic_id: cid,
          patient_id: null,
          sale_type: "walk_in",
          customer_name: customerName.trim() || "Walk-In Customer",
          customer_phone: customerPhone.trim() || null,
          customer_email: customerEmail.trim() || null,
          subtotal,
          discount_amount: discountValue,
          total_amount: total,
          amount_paid: paid,
          payment_method: paymentMethod,
          receipt_number: receiptNumber,
          notes: notes.trim() || null,
          sold_by: user?.id ?? null,
        } as any)
        .select("*")
        .single();
      if (error || !sale) throw error || new Error("Could not create sale");

      const saleRow = sale as unknown as WalkInSaleRow;
      const payload = lines.map((l) => ({
        clinic_id: cid,
        sale_id: saleRow.id,
        inventory_id: l.inventory_id,
        item_name: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        total_price: l.quantity * l.unit_price,
      }));
      // Stock deduction + movement logging is handled by the DB trigger on insert.
      const { error: itemsErr } = await apiClient.from("inventory_sale_items").insert(payload as any);
      if (itemsErr) throw itemsErr;

      const receiptLines: ReceiptLine[] = lines.map((l) => ({
        name: l.name, quantity: l.quantity, unit_price: l.unit_price, total_price: l.quantity * l.unit_price,
      }));
      const email = customerEmail.trim();
      resetForm();
      toast.success(`Walk-in sale recorded (${receiptNumber})`);
      await printReceipt(saleRow, receiptLines);
      if (email) emailReceipt(saleRow, email);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to complete sale");
    } finally {
      setSaving(false);
    }
  };

  const filtered = items.filter(
    (i) => i.stock_quantity > 0 && i.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="medical-card p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ShoppingBag size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold">Walk-In Sale (POS)</p>
          <p className="text-xs text-muted-foreground">
            Sell optical, pharmacy or other stock items to a walk-in customer. No patient record, visit,
            consultation or prescription is created. Stock and revenue update automatically.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Item picker */}
        <div className="medical-card p-3 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-xl h-9 text-xs pl-8"
              placeholder="Search items in stock..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full h-8 rounded-xl text-xs mb-2" onClick={addLensTransfer}>+ Lens Transfer</Button>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No items in stock.</p>
            ) : filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => addLine(item)}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-muted transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.category} • ₦{Number(item.price).toLocaleString()} • Stock: {item.stock_quantity}
                  </p>
                </div>
                <Plus size={14} className="text-primary shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Cart + payment */}
        <div className="medical-card p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Customer name (optional)</Label>
              <Input className="rounded-xl h-8 text-xs" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-In Customer" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Phone (optional)</Label>
              <Input className="rounded-xl h-8 text-xs" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-[10px]">Email (optional — for emailed receipt)</Label>
              <Input className="rounded-xl h-8 text-xs" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Cart is empty — pick items on the left.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((l, lineIndex) => (
                <div key={l.inventory_id || `transfer-${lineIndex}`} className="grid grid-cols-12 gap-2 items-end bg-muted/40 rounded-xl p-2">
                  <p className="col-span-12 text-xs font-medium truncate">{l.name}</p>
                  <div className="col-span-4">
                    <Label className="text-[10px]">Qty</Label>
                    <Input
                      className="rounded-lg h-8 text-xs"
                      type="number"
                      min={1}
                      max={l.available_stock}
                      value={l.quantity}
                      onChange={(e) => updateLine(l.inventory_id, {
                        quantity: Math.max(1, Math.min(parseInt(e.target.value) || 1, l.available_stock)),
                      })}
                    />
                  </div>
                  <div className="col-span-5">
                    <Label className="text-[10px]">Unit ₦</Label>
                    <Input
                      className="rounded-lg h-8 text-xs"
                      type="number"
                      min={0}
                      value={l.unit_price}
                      onChange={(e) => updateLine(l.inventory_id, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-[10px] text-muted-foreground">Line</p>
                    <p className="text-xs font-semibold">₦{(l.quantity * l.unit_price).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== lineIndex))}
                    className="col-span-1 p-1.5 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Discount ₦ {!canDiscount && "(admin only)"}</Label>
              <Input
                className="rounded-xl h-8 text-xs"
                type="number"
                min={0}
                disabled={!canDiscount}
                value={canDiscount ? discount : ""}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="rounded-xl h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Amount received ₦</Label>
              <Input
                className="rounded-xl h-8 text-xs"
                type="number"
                min={0}
                value={amountPaid}
                placeholder={String(total)}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Notes</Label>
              <Input className="rounded-xl h-8 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="bg-muted/50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[10px] text-muted-foreground">Subtotal</p><p className="text-sm font-bold">₦{subtotal.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Discount</p><p className="text-sm font-bold">₦{discountValue.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-muted-foreground">TOTAL</p><p className="text-base font-bold text-primary">₦{total.toLocaleString()}</p></div>
          </div>

          <Button className="rounded-xl w-full" onClick={completeSale} disabled={saving || lines.length === 0}>
            {saving ? "Recording sale..." : "Receive payment & print receipt"}
          </Button>
        </div>
      </div>

      {/* Recent walk-in sales */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent walk-in sales</p>
        {sales.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No walk-in sales yet.</div>
        ) : sales.map((s) => (
          <div key={s.id} className="medical-card p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">{s.customer_name || "Walk-In Customer"}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md uppercase bg-primary/10 text-primary">Walk-In</span>
                {s.receipt_number && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Receipt size={10} />{s.receipt_number}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(s.created_at).toLocaleString()} • ₦{Number(s.total_amount).toLocaleString()}
                {Number(s.discount_amount) > 0 && ` • Disc: ₦${Number(s.discount_amount).toLocaleString()}`}
                {s.payment_method && ` • ${s.payment_method}`}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => printReceipt(s)} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Print receipt">
                <Printer size={14} className="text-muted-foreground" />
              </button>
              {s.customer_email && (
                <button
                  onClick={() => emailReceipt(s)}
                  disabled={emailingId === s.id}
                  className="p-2 rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
                  title={`Email receipt to ${s.customer_email}`}
                >
                  <Mail size={14} className="text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
