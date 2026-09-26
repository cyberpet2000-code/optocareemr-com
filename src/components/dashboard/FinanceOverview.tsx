import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { formatMoney, startOfMonthISO, startOfDayISO } from "@/lib/finance";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Package, Users, Activity, FileText, Wallet } from "lucide-react";

interface Metrics {
  revenueToday: number; revenueMonth: number; revenuePreviousMonth: number;
  expensesToday: number; expensesMonth: number;
  newPatients: number; hmoPatients: number; privatePatients: number;
  outstanding: number; cashReceived: number; pendingHmo: number;
  inventoryValue: number; lowStock: number; outOfStock: number;
  consultations: number;
}

const NairaIcon = ({ size = 18 }: { size?: number }) => <span style={{ fontSize: size, lineHeight: 1, fontWeight: 700 }}>₦</span>;

const TONE: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

const Card = ({ icon: Icon, label, value, tone = "primary", to }: { icon: any; label: string; value: any; tone?: keyof typeof TONE; to?: string }) => {
  const content = (
    <div className="flex items-center gap-3">
      <div className={"w-10 h-10 rounded-lg flex items-center justify-center " + (TONE[tone] || TONE.primary)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
  if (!to) return <div className="form-section">{content}</div>;
  return <a href={to} className="form-section block transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">{content}</a>;
};

export default function FinanceOverview() {
  const { effectiveClinicId } = useClinic();
  const { isAdmin, isSuperAdmin } = useRole();
  const canViewFinance = isAdmin || isSuperAdmin;
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Only admins can see finance overview
  useEffect(() => {
    if (!canViewFinance || !effectiveClinicId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const som = startOfMonthISO();
      const sod = startOfDayISO();
      const somDate = som.slice(0, 10);
      const sodDate = sod.slice(0, 10);
      const previousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const previousMonthStart = startOfMonthISO(previousMonth);

      // Revenue recognition is clinic-specific. Cedar uses payment_date, while
      // clinics still using service_date retain the previous visit-date behavior.
      const { data: clinic } = await apiClient
        .from("clinics")
        .select("revenue_recognition_method")
        .eq("id", effectiveClinicId)
        .maybeSingle();
      const usesPaymentDate = clinic?.revenue_recognition_method === "payment_date";

      const billingMonthQuery = usesPaymentDate
        ? apiClient.from("payments").select("amount,created_at").eq("clinic_id", effectiveClinicId).gte("created_at", som)
        : apiClient.from("billing").select("total_amount,amount_paid,balance,status,payer_type,visit:visits!inner(created_at)").eq("clinic_id", effectiveClinicId).gte("visit.created_at", som);
      const billingTodayQuery = usesPaymentDate
        ? apiClient.from("payments").select("amount,created_at").eq("clinic_id", effectiveClinicId).gte("created_at", sod)
        : apiClient.from("billing").select("amount_paid,visit:visits!inner(created_at)").eq("clinic_id", effectiveClinicId).gte("visit.created_at", sod);
      const billingPreviousMonthQuery = usesPaymentDate
        ? apiClient.from("payments").select("amount,created_at").eq("clinic_id", effectiveClinicId).gte("created_at", previousMonthStart).lt("created_at", som)
        : apiClient.from("billing").select("amount_paid,visit:visits!inner(created_at)").eq("clinic_id", effectiveClinicId).gte("visit.created_at", previousMonthStart).lt("visit.created_at", som);

      const [billingMonth, billingToday, billingPreviousMonth, salesMonth, salesToday, salesPreviousMonth, expMonth, expToday, patientsMonth, patientsMonthHmo, patientsMonthPrivate, inv, visitsMonth] = await Promise.all([
        billingMonthQuery,
        billingTodayQuery,
        billingPreviousMonthQuery,
        apiClient.from("inventory_sales").select("total_amount,amount_paid").eq("clinic_id", effectiveClinicId).eq("sale_type", "walk_in").gte("created_at", som),
        apiClient.from("inventory_sales").select("amount_paid").eq("clinic_id", effectiveClinicId).eq("sale_type", "walk_in").gte("created_at", sod),
        apiClient.from("inventory_sales").select("amount_paid").eq("clinic_id", effectiveClinicId).eq("sale_type", "walk_in").gte("created_at", previousMonthStart).lt("created_at", som),
        apiClient.from("expenses").select("amount").eq("clinic_id", effectiveClinicId).gte("expense_date", somDate),
        apiClient.from("expenses").select("amount").eq("clinic_id", effectiveClinicId).gte("expense_date", sodDate),
        apiClient.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", effectiveClinicId).gte("created_at", som),
        apiClient.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", effectiveClinicId).gte("created_at", som).eq("payment_type", "hmo"),
        apiClient.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", effectiveClinicId).gte("created_at", som).neq("payment_type", "hmo"),
        apiClient.from("inventory").select("stock_quantity,price,low_stock_threshold,min_stock").eq("clinic_id", effectiveClinicId),
        apiClient.from("visits").select("id", { count: "exact", head: true }).eq("clinic_id", effectiveClinicId).gte("created_at", som),
      ]);
      if (cancelled) return;

      const bMonth = (billingMonth.data as any[]) || [];
      const bPreviousMonth = (billingPreviousMonth.data as any[]) || [];
      const bToday = (billingToday.data as any[]) || [];
      const sMonth = (salesMonth.data as any[]) || [];
      const sPreviousMonth = (salesPreviousMonth.data as any[]) || [];
      const sToday = (salesToday.data as any[]) || [];
      const invRows = (inv.data as any[]) || [];
      const newPatientsCount = patientsMonth.count ?? 0;
      const hmoPatientsCount = patientsMonthHmo.count ?? 0;
      const privatePatientsCount = patientsMonthPrivate.count ?? 0;
      const eMonth = (expMonth.data as any[]) || [];
      const eToday = (expToday.data as any[]) || [];

      const sumRevenueRows = (rows: any[]) =>
        rows.reduce((a, r) => a + Number(r.amount ?? r.amount_paid ?? 0), 0);

      const metrics: Metrics = {
        revenueToday: sumRevenueRows(bToday) + sumRevenueRows(sToday),
        revenueMonth: sumRevenueRows(bMonth) + sumRevenueRows(sMonth),
        revenuePreviousMonth: sumRevenueRows(bPreviousMonth) + sumRevenueRows(sPreviousMonth),
        expensesToday: eToday.reduce((a, r) => a + Number(r.amount || 0), 0),
        expensesMonth: eMonth.reduce((a, r) => a + Number(r.amount || 0), 0),
        newPatients: newPatientsCount,
        hmoPatients: hmoPatientsCount,
        privatePatients: privatePatientsCount,
        outstanding: bMonth.reduce((a, r) => a + Number(r.balance || 0), 0) + sMonth.reduce((a, r) => a + Math.max(Number(r.total_amount || 0) - Number(r.amount_paid || 0), 0), 0),
        cashReceived: sumRevenueRows(bMonth) + sumRevenueRows(sMonth),
        pendingHmo: !usesPaymentDate ? bMonth.filter(r => r.payer_type === "hmo" && r.status !== "paid").length : 0,
        inventoryValue: invRows.reduce((a, r) => a + Number(r.stock_quantity || 0) * Number(r.price || 0), 0),
        lowStock: invRows.filter(r => (r.stock_quantity ?? 0) > 0 && (r.stock_quantity ?? 0) <= (r.low_stock_threshold ?? r.min_stock ?? 5)).length,
        outOfStock: invRows.filter(r => (r.stock_quantity ?? 0) <= 0).length,
        consultations: visitsMonth.count ?? 0,
      };
      setM(metrics);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [effectiveClinicId, canViewFinance]);

  if (!canViewFinance) {
    return null;
  }

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
    <section className="rounded-2xl border border-border/60 bg-card/80 p-3.5 shadow-sm sm:p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Month at a glance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Finance & operations for the current month.</p>
        </div>
        <span className="rounded-full bg-primary/5 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Management</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <Card icon={NairaIcon} label="Revenue this month" value={formatMoney(m.revenueMonth)} tone="success" to="/billing" />
        <Card icon={NairaIcon} label="Revenue last month" value={formatMoney(m.revenuePreviousMonth)} tone="primary" to="/reports/monthly" />
        <Card icon={Users} label="New patients" value={m.newPatients} tone="primary" to="/patients" />
        <Card icon={Activity} label="Consultations" value={m.consultations} tone="primary" to="/visits" />
        <Card icon={NairaIcon} label="Outstanding" value={formatMoney(m.outstanding)} tone="destructive" to="/billing" />
        <Card icon={Wallet} label="Expenses" value={formatMoney(m.expensesMonth)} tone="warning" to="/finance/expenses" />
        <Card icon={TrendingUp} label="Net position" value={formatMoney(netProfit)} tone={netProfit >= 0 ? "success" : "destructive"} to="/reports/monthly" />
        <Card icon={FileText} label="HMO patients" value={m.hmoPatients} tone="primary" to="/hmos" />
        <Card icon={FileText} label="Pending HMO claims" value={m.pendingHmo} tone="warning" to="/hmos" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Card icon={NairaIcon} label="Received today" value={formatMoney(m.revenueToday)} tone="success" to="/billing" />
        <Card icon={Wallet} label="Expenses today" value={formatMoney(m.expensesToday)} tone="warning" to="/finance/expenses" />
        <Card icon={Package} label="Inventory value" value={formatMoney(m.inventoryValue)} tone="primary" to="/inventory" />
        <Card icon={Package} label="Stock alerts" value={m.lowStock + m.outOfStock} tone={m.lowStock + m.outOfStock > 0 ? "warning" : "success"} to="/inventory" />
      </div>
    </section>
  );
}
