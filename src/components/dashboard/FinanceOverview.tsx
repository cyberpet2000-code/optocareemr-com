import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { formatMoney, startOfMonthISO, startOfDayISO } from "@/lib/finance";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, TrendingDown, Package, Users, Activity, FileText, Wallet } from "lucide-react";

interface Metrics {
  revenueToday: number; revenueMonth: number;
  expensesToday: number; expensesMonth: number;
  newPatients: number; hmoPatients: number; privatePatients: number;
  outstanding: number; cashReceived: number; pendingHmo: number;
  inventoryValue: number; lowStock: number; outOfStock: number;
  consultations: number;
}

const TONE: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

const Card = ({ icon: Icon, label, value, tone = "primary" }: { icon: any; label: string; value: any; tone?: keyof typeof TONE }) => (
  <div className="form-section">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${TONE[tone] || TONE.primary}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  </div>
);

export default function FinanceOverview() {
  const { effectiveClinicId } = useClinic();
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!effectiveClinicId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const som = startOfMonthISO();
      const sod = startOfDayISO();
      const somDate = som.slice(0, 10);
      const sodDate = sod.slice(0, 10);

      const [billingMonth, billingToday, salesMonth, salesToday, expMonth, expToday, patientsMonth, inv, visitsMonth] = await Promise.all([
        apiClient.from("billing").select("total_amount,amount_paid,balance,status,payer_type,visit:visits!inner(created_at)").eq("clinic_id", effectiveClinicId).gte("visit.created_at", som),
        apiClient.from("billing").select("amount_paid,visit:visits!inner(created_at)").eq("clinic_id", effectiveClinicId).gte("visit.created_at", sod),
        apiClient.from("inventory_sales").select("total_amount,amount_paid").eq("clinic_id", effectiveClinicId).eq("sale_type", "walk_in").gte("created_at", som),
        apiClient.from("inventory_sales").select("amount_paid").eq("clinic_id", effectiveClinicId).eq("sale_type", "walk_in").gte("created_at", sod),
        apiClient.from("expenses").select("amount").eq("clinic_id", effectiveClinicId).gte("expense_date", somDate),
        apiClient.from("expenses").select("amount").eq("clinic_id", effectiveClinicId).gte("expense_date", sodDate),
        apiClient.from("patients").select("id,payment_type,created_at").eq("clinic_id", effectiveClinicId).gte("created_at", som),
        apiClient.from("inventory").select("stock_quantity,price,low_stock_threshold,min_stock").eq("clinic_id", effectiveClinicId),
        apiClient.from("visits").select("id,status").eq("clinic_id", effectiveClinicId).gte("created_at", som),
      ]);
      if (cancelled) return;

      const bMonth = (billingMonth.data as any[]) || [];
      const bToday = (billingToday.data as any[]) || [];
      const sMonth = (salesMonth.data as any[]) || [];
      const sToday = (salesToday.data as any[]) || [];
      const invRows = (inv.data as any[]) || [];
      const pRows = (patientsMonth.data as any[]) || [];
      const eMonth = (expMonth.data as any[]) || [];
      const eToday = (expToday.data as any[]) || [];

      const metrics: Metrics = {
        revenueToday: bToday.reduce((a, r) => a + Number(r.amount_paid || 0), 0) + sToday.reduce((a, r) => a + Number(r.amount_paid || 0), 0),
        revenueMonth: bMonth.reduce((a, r) => a + Number(r.amount_paid || 0), 0) + sMonth.reduce((a, r) => a + Number(r.amount_paid || 0), 0),
        expensesToday: eToday.reduce((a, r) => a + Number(r.amount || 0), 0),
        expensesMonth: eMonth.reduce((a, r) => a + Number(r.amount || 0), 0),
        newPatients: pRows.length,
        hmoPatients: pRows.filter(p => (p.payment_type || "").toLowerCase() === "hmo").length,
        privatePatients: pRows.filter(p => (p.payment_type || "").toLowerCase() !== "hmo").length,
        outstanding: bMonth.reduce((a, r) => a + Number(r.balance || 0), 0) + sMonth.reduce((a, r) => a + Math.max(Number(r.total_amount || 0) - Number(r.amount_paid || 0), 0), 0),
        cashReceived: bMonth.reduce((a, r) => a + Number(r.amount_paid || 0), 0) + sMonth.reduce((a, r) => a + Number(r.amount_paid || 0), 0),
        pendingHmo: bMonth.filter(r => r.payer_type === "hmo" && r.status !== "paid").length,
        inventoryValue: invRows.reduce((a, r) => a + Number(r.stock_quantity || 0) * Number(r.price || 0), 0),
        lowStock: invRows.filter(r => (r.stock_quantity ?? 0) > 0 && (r.stock_quantity ?? 0) <= (r.low_stock_threshold ?? r.min_stock ?? 5)).length,
        outOfStock: invRows.filter(r => (r.stock_quantity ?? 0) <= 0).length,
        consultations: ((visitsMonth.data as any[]) || []).length,
      };
      setM(metrics);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [effectiveClinicId]);

  if (loading || !m) {
    return (
      <div className="mt-6 space-y-3">
        <h2 className="text-lg font-bold">Finance & Operations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  const netProfit = m.revenueMonth - m.expensesMonth;

  return (
    <div className="mt-8 space-y-4">
      <div>
        <h2 className="text-lg font-bold">Finance & Operations</h2>
        <p className="text-xs text-muted-foreground">This month at a glance</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card icon={DollarSign} label="Revenue (today)" value={formatMoney(m.revenueToday)} tone="success" />
        <Card icon={TrendingUp} label="Revenue (month)" value={formatMoney(m.revenueMonth)} tone="success" />
        <Card icon={Wallet} label="Expenses (today)" value={formatMoney(m.expensesToday)} tone="warning" />
        <Card icon={TrendingDown} label="Expenses (month)" value={formatMoney(m.expensesMonth)} tone="warning" />
        <Card icon={Activity} label="Net profit" value={formatMoney(netProfit)} tone={netProfit >= 0 ? "success" : "destructive"} />
        <Card icon={Users} label="New patients" value={`${m.newPatients} (${m.hmoPatients} HMO)`} tone="primary" />
        <Card icon={FileText} label="Consultations" value={m.consultations} tone="primary" />
        <Card icon={DollarSign} label="Outstanding" value={formatMoney(m.outstanding)} tone="destructive" />
        <Card icon={Package} label="Inventory value" value={formatMoney(m.inventoryValue)} tone="primary" />
        <Card icon={Package} label="Low stock" value={m.lowStock} tone="warning" />
        <Card icon={Package} label="Out of stock" value={m.outOfStock} tone="destructive" />
        <Card icon={FileText} label="Pending HMO claims" value={m.pendingHmo} tone="warning" />
      </div>
    </div>
  );
}
