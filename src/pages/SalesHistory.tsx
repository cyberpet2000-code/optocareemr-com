import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { History } from "lucide-react";

interface SaleRecord {
  id: string;
  total_amount: number;
  created_at: string;
  patient_name?: string;
  items: { name: string; quantity: number; unit_price: number; total_price: number }[];
}

export default function SalesHistory() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: salesData } = await supabase
        .from("inventory_sales").select("*")
        .order("created_at", { ascending: false }).limit(100);
      if (!salesData || salesData.length === 0) { setLoading(false); return; }

      const saleIds = salesData.map((s: any) => s.id);
      const patientIds = [...new Set(salesData.map((s: any) => s.patient_id).filter(Boolean))] as string[];

      const [itemsRes, patsRes] = await Promise.all([
        supabase.from("inventory_sale_items").select("*").in("sale_id", saleIds),
        patientIds.length > 0
          ? supabase.from("patients").select("id, full_name").in("id", patientIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const patMap = new Map((patsRes.data || []).map((p: any) => [p.id, p.full_name]));

      const itemsBySale = new Map<string, any[]>();
      (itemsRes.data || []).forEach((item: any) => {
        const arr = itemsBySale.get(item.sale_id) || [];
        arr.push(item);
        itemsBySale.set(item.sale_id, arr);
      });

      const invIds = [...new Set((itemsRes.data || []).map((i: any) => i.inventory_id))] as string[];
      let invMap = new Map<string, string>();
      if (invIds.length > 0) {
        const { data: invData } = await supabase.from("inventory").select("id, name").in("id", invIds);
        invMap = new Map((invData || []).map((i: any) => [i.id, i.name]));
      }

      setSales(salesData.map((s: any) => ({
        id: s.id,
        total_amount: s.total_amount,
        created_at: s.created_at,
        patient_name: s.patient_id ? patMap.get(s.patient_id) || "Unknown" : "Walk-in",
        items: (itemsBySale.get(s.id) || []).map((item: any) => ({
          name: invMap.get(item.inventory_id) || "Unknown",
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        })),
      })));
      setLoading(false);
    })();
  }, []);

  return (
    <AppLayout>
      <h1 className="page-header mb-5 flex items-center gap-2"><History size={20} /> Sales History</h1>
      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : sales.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No sales recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {sales.map(s => (
            <details key={s.id} className="medical-card p-0 overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer hover:bg-muted/50 text-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{new Date(s.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
                  <span className="text-muted-foreground text-xs">{s.patient_name}</span>
                </div>
                <span className="font-bold">₦{Number(s.total_amount).toLocaleString()}</span>
              </summary>
              <div className="px-4 pb-4 border-t border-border/60 pt-3 space-y-1">
                {s.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span>{item.name} × {item.quantity}</span>
                    <span className="text-muted-foreground">₦{Number(item.total_price).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
