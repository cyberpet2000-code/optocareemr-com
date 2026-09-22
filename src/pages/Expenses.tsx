import { useEffect, useMemo, useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { EXPENSE_CATEGORIES, formatMoney, startOfMonthISO } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Trash2, Download, Receipt, FileDown } from "lucide-react";
import { toast } from "sonner";
import { confirmDestructiveAction } from "@/lib/safeDelete";

interface ExpenseRow {
  id: string;
  clinic_id: string;
  category: string;
  description: string | null;
  amount: number;
  payment_method: string | null;
  vendor: string | null;
  receipt_url: string | null;
  expense_date: string;
  created_by: string | null;
  created_at: string;
}

const emptyForm = {
  category: EXPENSE_CATEGORIES[0] as string,
  description: "",
  amount: "" as string,
  payment_method: "Cash",
  vendor: "",
  expense_date: new Date().toISOString().slice(0, 10),
  receipt: null as File | null,
};

export default function Expenses() {
  const { effectiveClinicId } = useClinic();
  const { isAdmin, isSuperAdmin } = useRole();
  const { user } = useAuth();
  const canWrite = isAdmin || isSuperAdmin;

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveClinicId) return;
    setLoading(true);
    let q = apiClient
      .from("expenses")
      .select("*")
      .eq("clinic_id", effectiveClinicId)
      .order("expense_date", { ascending: false })
      .limit(1000);
    if (category !== "all") q = q.eq("category", category);
    if (from) q = q.gte("expense_date", from);
    if (to) q = q.lte("expense_date", to);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  }, [effectiveClinicId, category, from, to]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.description || "").toLowerCase().includes(s) ||
      (r.vendor || "").toLowerCase().includes(s) ||
      r.category.toLowerCase().includes(s));
  }, [rows, search]);

  const monthTotal = useMemo(() => {
    const som = startOfMonthISO().slice(0, 10);
    return rows.filter(r => r.expense_date >= som).reduce((a, r) => a + Number(r.amount || 0), 0);
  }, [rows]);
  const total = useMemo(() => filtered.reduce((a, r) => a + Number(r.amount || 0), 0), [filtered]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }
  function openEdit(r: ExpenseRow) {
    setEditing(r);
    setForm({
      category: r.category,
      description: r.description || "",
      amount: String(r.amount),
      payment_method: r.payment_method || "Cash",
      vendor: r.vendor || "",
      expense_date: r.expense_date,
      receipt: null,
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!effectiveClinicId) return;
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      let receipt_url = editing?.receipt_url || null;
      if (form.receipt) {
        const path = `${effectiveClinicId}/${Date.now()}-${form.receipt.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
        const up = await apiClient.storage.from("expense-receipts").upload(path, form.receipt, { upsert: false });
        if (up.error) throw up.error;
        receipt_url = up.data?.path || null;
      }
      const payload = {
        clinic_id: effectiveClinicId,
        category: form.category,
        description: form.description || null,
        amount: amt,
        payment_method: form.payment_method || null,
        vendor: form.vendor || null,
        expense_date: form.expense_date,
        receipt_url,
        created_by: user?.id || null,
      };
      if (editing) {
        const { error } = await apiClient.from("expenses").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Expense updated");
      } else {
        const { error } = await apiClient.from("expenses").insert(payload);
        if (error) throw error;
        toast.success("Expense added");
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: ExpenseRow) {
    if (!(await confirmDestructiveAction({ item: `expense "${r.description || r.category}"` })) return;
    const { error } = await apiClient.from("expenses").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    await load();
  }

  async function openReceipt(r: ExpenseRow) {
    if (!r.receipt_url) return;
    const { data, error } = await apiClient.storage.from("expense-receipts").createSignedUrl(r.receipt_url, 300);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  function exportCsv() {
    const header = ["Date","Category","Description","Vendor","Payment","Amount"];
    const lines = [header.join(",")].concat(filtered.map(r => [
      r.expense_date, JSON.stringify(r.category), JSON.stringify(r.description || ""),
      JSON.stringify(r.vendor || ""), JSON.stringify(r.payment_method || ""), r.amount,
    ].join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `expenses-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track and manage clinic expenses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><FileDown size={16} className="mr-1" /> Export CSV</Button>
          {canWrite && <Button onClick={openNew}><Plus size={16} className="mr-1" /> Add expense</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="form-section">
          <div className="text-xs text-muted-foreground">This month</div>
          <div className="text-2xl font-bold mt-1">{formatMoney(monthTotal)}</div>
        </div>
        <div className="form-section">
          <div className="text-xs text-muted-foreground">Filtered total</div>
          <div className="text-2xl font-bold mt-1">{formatMoney(total)}</div>
        </div>
        <div className="form-section">
          <div className="text-xs text-muted-foreground">Entries</div>
          <div className="text-2xl font-bold mt-1">{filtered.length}</div>
        </div>
      </div>

      <div className="form-section space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, vendor…" className="pl-8" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="py-2"><Skeleton className="h-6 w-full" /></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No expenses</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-3 whitespace-nowrap">{r.expense_date}</td>
                  <td className="py-2 pr-3">{r.category}</td>
                  <td className="py-2 pr-3">{r.description || <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2 pr-3">{r.vendor || <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2 pr-3 text-right font-medium">{formatMoney(Number(r.amount))}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="flex justify-end gap-1">
                      {r.receipt_url && (
                        <Button size="icon" variant="ghost" onClick={() => openReceipt(r)} title="Receipt"><Receipt size={14} /></Button>
                      )}
                      {canWrite && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil size={14} /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 size={14} /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₦)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
            </div>
            <div>
              <Label>Payment method</Label>
              <Input value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} placeholder="Cash, Bank Transfer…" />
            </div>
            <div>
              <Label>Vendor</Label>
              <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="col-span-2">
              <Label>Receipt (optional)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={e => setForm(f => ({ ...f, receipt: e.target.files?.[0] || null }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
