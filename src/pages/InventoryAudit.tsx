import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Movement {
  id: string; clinic_id: string; inventory_id: string | null;
  product_name: string | null; quantity_before: number | null;
  quantity_delta: number; quantity_after: number | null;
  reason: string; patient_id: string | null; visit_id: string | null;
  staff_id: string | null; notes: string | null; created_at: string;
}

const REASONS = ["all","dispensed","sale","manual_adjustment","return","stock_count","restock"];

export default function InventoryAudit() {
  const { effectiveClinicId } = useClinic();
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!effectiveClinicId) return;
    setLoading(true);
    let q = apiClient.from("inventory_movements").select("*")
      .eq("clinic_id", effectiveClinicId).order("created_at", { ascending: false }).limit(500);
    if (reason !== "all") q = q.eq("reason", reason);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  }, [effectiveClinicId, reason]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => !search || (r.product_name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory Audit</h1>
        <p className="text-sm text-muted-foreground">Complete stock movement log</p>
      </div>
      <div className="form-section space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product…" className="max-w-xs" />
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>{REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3 text-right">Before</th>
                <th className="py-2 pr-3 text-right">Δ</th>
                <th className="py-2 pr-3 text-right">After</th>
                <th className="py-2 pr-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="py-2"><Skeleton className="h-6 w-full" /></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No movements</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{r.product_name || "—"}</td>
                  <td className="py-2 pr-3"><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.reason}</span></td>
                  <td className="py-2 pr-3 text-right">{r.quantity_before ?? "—"}</td>
                  <td className={`py-2 pr-3 text-right font-medium ${r.quantity_delta < 0 ? "text-destructive" : "text-success"}`}>{r.quantity_delta > 0 ? "+" : ""}{r.quantity_delta}</td>
                  <td className="py-2 pr-3 text-right">{r.quantity_after ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{r.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
