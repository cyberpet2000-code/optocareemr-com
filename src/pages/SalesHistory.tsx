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
    async function load() {
      const { data: salesData } = await supabase.from("inventory_sales").select("*").order("created_at", { ascending: false }).limit(100);
      if (!salesData || salesData.length === 0) { setLoading(false); return; }

      const saleIds = salesData.map((s: any) => s.id);
      const patientIds = [...new Set(salesData.map((s: any) => s.patient_id).filter(Boolean))];

      const [itemsRes, patsRes] = await Promise.all([
        supabase.from("inventory_sale_items").select("*").in("sale_id", saleIds),
        patientIds.length > 0 ? supabase.from("patients").select("id, full_name").in("id", patientIds as any) : { data: [] },
      ]);

      const patMap = new Map((patsRes.data || []).map((p: any) => [p.id, p.full_name]));
      const itemsBySale = new Map<string, any[]>();
      (itemsRes.data || []).forEach((item: any) => {
        const arr = itemsBySale.get(item.sale_id) || [];
        arr.push(item);
        itemsBySale.set(item.sale_id, arr);
      });

      // Get inventory names
      const invIds = [...new Set((itemsRes.data || []).map((i: any) => i.inventory_id))];
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
    }
    load();
  }, []);

  return (
    <AppLayout>
      <h1 className="page-header mb-6"><History size={22} className="inline mr-2" />Sales History</h1>

      <div className="medical-card">
        {loading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
        ) : sales.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No sales recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {sales.map(s => (
              <details key={s.id} className="border border-border rounded-lg">
                <summary className="px-4 py-3 cursor-pointer hover:bg-muted/50 rounded-lg font-medium text-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{new Date(s.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
                    <span className="text-muted-foreground">{s.patient_name}</span>
                  </div>
                  <span className="font-bold">₦{Number(s.total_amount).toLocaleString()}</span>
                </summary>
                <div className="px-4 pb-4 border-t border-border pt-3">
                  <div className="space-y-1">
                    {s.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>{item.name} × {item.quantity}</span>
                        <span className="text-muted-foreground">₦{Number(item.total_price).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
