import OptoLoader from "@/components/OptoLoader";
import EmptyState from "@/components/EmptyState";
import { useState, useEffect, useCallback } from "react";
import {
  enableNotifications,
  showNotification,
} from "@/lib/notifications";
import {
  checkRevenueMismatch,
  checkClinicSubscription,
} from "@/lib/diag/healthChecks";
import { Link, useSearchParams } from "react-router-dom";
import { Users, ChevronRight, AlertTriangle, DollarSign, TrendingUp, Clock } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { startLoadingWatch,
  stopLoadingWatch, checkQueryFailure,} from "@/lib/diag";
import { useClinic } from "@/hooks/useClinic";
import { offlineStore } from "@/lib/offlineStore";
import { useOffline } from "@/hooks/useOffline";
import FinanceOverview from "@/components/dashboard/FinanceOverview";

interface DashboardSnapshot {
  todayVisits: number;
  monthPatients: number;
  previousMonthRevenue: number;
  monthlyRevenue: number;
  todayAppointments: number;
  pendingBills: number;
  lowStockCount: number;
  drugAlerts: number;
  recentPatients: any[];
  upcomingAppts: any[];
}

export default function Dashboard() {
  useEffect(() => {
    enableNotifications();
  }, []);
  const { user } = useAuth();
  const { effectiveClinicId } = useClinic();
  useEffect(() => {
    if (!effectiveClinicId) return;

    const channel = apiClient
      .channel(`patients-${effectiveClinicId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "patients",
          filter: `clinic_id=eq.${effectiveClinicId}`,
        },
        (payload) => {
          showNotification(
            "🔔 New Patient Added",
            payload.new.full_name || "New patient"
          );
        }
      )
      .subscribe();

    return () => {
      apiClient.removeChannel(channel);
    };
  }, [effectiveClinicId]);
  const { isOffline } = useOffline();
  const [monthPatients, setMonthPatients] = useState(0);
  const [todayVisits, setTodayVisits] = useState(0);
  const [todayAppointments, setTodayAppointments] = useState(0);
  const [pendingBills, setPendingBills] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [previousMonthRevenue, setPreviousMonthRevenue] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [upcomingAppts, setUpcomingAppts] = useState<any[]>([]);
  const [drugAlerts, setDrugAlerts] = useState(0);
  const [loading, setLoading] = useState(true);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = user?.user_metadata?.full_name || "Doctor";
  const now = new Date();

  const currentMonthName = now.toLocaleString("en-US", {
    month: "long",
  });

  const previousMonthName = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  ).toLocaleString("en-US", {
    month: "long",
  });

  useEffect(() => {
    if (!effectiveClinicId) return;

    const channel = apiClient
      .channel(`visits-${effectiveClinicId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "visits",
          filter: `clinic_id=eq.${effectiveClinicId}`,
        },
        (payload) => {
          if (payload.new.status === "completed") {
            showNotification(
              "✅ Visit Completed",
              "A patient visit was completed"
            );
          }
        }
      )
      .subscribe();

    return () => {
      apiClient.removeChannel(channel);
    };
  }, [effectiveClinicId]);

  const loadDashboard = useCallback(async () => {
    if (!effectiveClinicId) {
      console.debug("[dashboard] no active clinic, skipping fetch");
      stopLoadingWatch("dashboard");
      setLoading(false);
      return;
    }
    const cid = effectiveClinicId;
    const clinicRes = await apiClient
  .from("clinics")
  .select("subscription_status")
  .eq("id", cid)
  .maybeSingle();
    
checkQueryFailure(
  "clinics",
  "subscription check",
  clinicRes.error
);

    const clinic = clinicRes.data;

checkClinicSubscription(
  clinic?.subscription_status
);
    const cacheKey = `dashboard:${cid}`;

    const hydrateFromCache = () => {
      const snap = offlineStore.get<DashboardSnapshot>(cacheKey);
      if (snap) {
        setMonthPatients(snap.monthPatients ?? 0);
        setTodayVisits(snap.todayVisits ?? 0);
        setTodayAppointments(snap.todayAppointments ?? 0);
        setPendingBills(snap.pendingBills ?? 0);
        setMonthlyRevenue(snap.monthlyRevenue ?? 0);
        setPreviousMonthRevenue(
          snap.previousMonthRevenue ?? 0
        );
        setLowStockCount(snap.lowStockCount ?? 0);
        setDrugAlerts(snap.drugAlerts ?? 0);
        setRecentPatients(snap.recentPatients ?? []);
        setUpcomingAppts(snap.upcomingAppts ?? []);
      }
      stopLoadingWatch("dashboard");
      setLoading(false);
    };
    // Offline: skip network entirely.
    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      hydrateFromCache();
      return;
    }

    setLoading(true);
    startLoadingWatch("dashboard");
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    ).toISOString();

    try {
      const [
        patientsRes,
        monthPatientsRes,
        visitsRes,
        apptRes,
        upcomingApptRes,
        invRes,
        billRes,
        revenueRes,
        prevRevenueRes,
        drugRes,
      ] = await Promise.all([
        apiClient.from("patients").select("id, full_name, age, gender, phone, payment_type, queue_number").eq("clinic_id", cid).order("created_at", { ascending: false }).limit(5),
        apiClient.from("patients").select("*", { count: "exact", head: true }).eq("clinic_id", cid).gte("created_at", monthStart),
        apiClient.from("visits").select("*", { count: "exact", head: true }).eq("clinic_id", cid).gte("created_at", `${today}T00:00:00`),
        apiClient.from("appointments").select("*", { count: "exact", head: true }).eq("clinic_id", cid).gte("appointment_date", today).in("status", ["pending", "confirmed"]),
        apiClient.from("appointments").select("id, appointment_date, appointment_time, reason, patient_id").eq("clinic_id", cid).gte("appointment_date", today).in("status", ["pending", "confirmed"]).order("appointment_date", { ascending: true }).limit(5),
        apiClient.from("inventory").select("*", { count: "exact", head: true }).eq("clinic_id", cid).lte("stock_quantity", 5),
        apiClient.from("billing").select("*", { count: "exact", head: true }).eq("clinic_id", cid).eq("status", "pending"),
        apiClient
  .from("billing")
  .select(`
    total_amount,
    visit:visits!billing_visit_id_fkey(
      created_at
    )
  `)
  .eq("clinic_id", cid)
  .eq("status", "paid"),
        apiClient
  .from("billing")
  .select(`
    total_amount,
    visit:visits!billing_visit_id_fkey(
      created_at
    )
  `)
  .eq("clinic_id", cid)
  .eq("status", "paid"),
        apiClient.from("drugs").select("*", { count: "exact", head: true }).eq("clinic_id", cid).lte("stock", 5),
      ]);
      
      checkQueryFailure(
  "patients",
  "recent patients",
  patientsRes.error
);

checkQueryFailure(
  "patients",
  "monthly count",
  monthPatientsRes.error
);

checkQueryFailure(
  "visits",
  "today visits",
  visitsRes.error
);

checkQueryFailure(
  "appointments",
  "today appointments",
  apptRes.error
);

checkQueryFailure(
  "appointments",
  "upcoming appointments",
  upcomingApptRes.error
);

checkQueryFailure(
  "inventory",
  "low stock check",
  invRes.error
);

checkQueryFailure(
  "billing",
  "pending bills",
  billRes.error
);

checkQueryFailure(
  "billing",
  "current revenue",
  revenueRes.error
);

checkQueryFailure(
  "billing",
  "previous revenue",
  prevRevenueRes.error
);

checkQueryFailure(
  "drugs",
  "low stock drugs",
  drugRes.error
);

      const { count: patientsMissing } = await apiClient
  .from("patients")
  .select("*", { count: "exact", head: true })
  .is("clinic_id", null);

const { count: visitsMissing } = await apiClient
  .from("visits")
  .select("*", { count: "exact", head: true })
  .is("clinic_id", null);

const { count: appointmentsMissing } = await apiClient
  .from("appointments")
  .select("*", { count: "exact", head: true })
  .is("clinic_id", null);

const { count: billingMissing } = await apiClient
  .from("billing")
  .select("*", { count: "exact", head: true })
  .is("clinic_id", null);

      if ((patientsMissing || 0) > 0) {
  console.warn(
    `[DIAG] patients missing clinic_id: ${patientsMissing}`
  );
}

if ((visitsMissing || 0) > 0) {
  console.warn(
    `[DIAG] visits missing clinic_id: ${visitsMissing}`
  );
}

if ((appointmentsMissing || 0) > 0) {
  console.warn(
    `[DIAG] appointments missing clinic_id: ${appointmentsMissing}`
  );
}

if ((billingMissing || 0) > 0) {
  console.warn(
    `[DIAG] billing missing clinic_id: ${billingMissing}`
  );
}

      const sumAmount = (rows: any) => Array.isArray(rows) ? rows.reduce((s, r) => s + Number(r.total_amount || 0), 0) : 0;
      const currentMonthRevenue =
  (revenueRes.data || [])
    .filter((bill: any) => {
      const visitDate =
        bill.visit?.created_at
          ? new Date(
              bill.visit.created_at
            )
          : null;

      return (
        visitDate &&
        visitDate.getMonth() ===
          now.getMonth() &&
        visitDate.getFullYear() ===
          now.getFullYear()
      );
    })
    .reduce(
      (sum: number, bill: any) =>
        sum +
        Number(
          bill.total_amount || 0
        ),
      0
    );

      const billingRevenue =
  sumAmount(revenueRes.data);

checkRevenueMismatch(
  billingRevenue,
  currentMonthRevenue
);

      const previousMonthRevenueCalc =
  (prevRevenueRes.data || [])
    .filter((bill: any) => {
      const visitDate =
        bill.visit?.created_at
          ? new Date(bill.visit.created_at)
          : null;

      const prevMonth =
        now.getMonth() === 0
          ? 11
          : now.getMonth() - 1;

      const prevYear =
        now.getMonth() === 0
          ? now.getFullYear() - 1
          : now.getFullYear();

      return (
        visitDate &&
        visitDate.getMonth() === prevMonth &&
        visitDate.getFullYear() === prevYear
      );
    })
    .reduce(
      (sum: number, bill: any) =>
        sum + Number(bill.total_amount || 0),
      0
    );

      console.log("Revenue rows", revenueRes.data);
console.log("Current month revenue", currentMonthRevenue);
      const snap: DashboardSnapshot = {
        monthPatients: monthPatientsRes.count ?? 0,
        todayVisits: visitsRes.count ?? 0,
        todayAppointments: apptRes.count ?? 0,
        pendingBills: billRes.count ?? 0,
        monthlyRevenue: currentMonthRevenue,
        previousMonthRevenue: previousMonthRevenueCalc,
        lowStockCount: invRes.count ?? 0,
        drugAlerts: drugRes.count ?? 0,
        recentPatients: (patientsRes.data as any[]) ?? [],
        upcomingAppts: (upcomingApptRes.data as any[]) ?? [],
      };

      setMonthPatients(snap.monthPatients);
      setTodayVisits(snap.todayVisits);
      setTodayAppointments(snap.todayAppointments);
      setPendingBills(snap.pendingBills);
      setMonthlyRevenue(snap.monthlyRevenue);
      setPreviousMonthRevenue(snap.previousMonthRevenue);
      setLowStockCount(snap.lowStockCount);
      setDrugAlerts(snap.drugAlerts);
      setRecentPatients(snap.recentPatients);
      setUpcomingAppts(snap.upcomingAppts);
      offlineStore.save(cacheKey, snap);

      stopLoadingWatch("dashboard");
      setLoading(false);
    } catch (e) {
      console.warn("[dashboard] load failed, using cache", e);
      // On failure use local cache.
      const cidFallback = effectiveClinicId;
      const cacheKeyFallback = `dashboard:${cidFallback}`;
      const snap = offlineStore.get<DashboardSnapshot>(cacheKeyFallback);
      if (snap) {
        setMonthPatients(snap.monthPatients ?? 0);
        setTodayVisits(snap.todayVisits ?? 0);
        setTodayAppointments(snap.todayAppointments ?? 0);
        setPendingBills(snap.pendingBills ?? 0);
        setMonthlyRevenue(snap.monthlyRevenue ?? 0);
        setPreviousMonthRevenue(snap.previousMonthRevenue ?? 0);
        setLowStockCount(snap.lowStockCount ?? 0);
        setDrugAlerts(snap.drugAlerts ?? 0);
        setRecentPatients(snap.recentPatients ?? []);
        setUpcomingAppts(snap.upcomingAppts ?? []);
      }
      stopLoadingWatch("dashboard");
      setLoading(false);
    }
  }, [effectiveClinicId, isOffline]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const onSync = (ev: Event) => {
      const e = ev as CustomEvent<{ clinicId?: string }>;
      if (!e?.detail?.clinicId) return;
      if (e.detail.clinicId === effectiveClinicId) {
        loadDashboard();
      }
    };
    window.addEventListener("optocare:sync:done", onSync as EventListener);
    return () => window.removeEventListener("optocare:sync:done", onSync as EventListener);
  }, [effectiveClinicId, loadDashboard]);

  const tealGrad = "linear-gradient(135deg, hsl(184 78% 40% / 0.10) 0%, hsl(192 92% 50% / 0.16) 100%)";
  const tealIcon = "linear-gradient(135deg, hsl(184 78% 40% / 0.22) 0%, hsl(192 92% 50% / 0.30) 100%)";
  const navyGrad = "linear-gradient(135deg, hsl(222 65% 16% / 0.10) 0%, hsl(217 91% 55% / 0.16) 100%)";
  const navyIcon = "linear-gradient(135deg, hsl(222 65% 16% / 0.22) 0%, hsl(217 91% 55% / 0.30) 100%)";
  const amberGrad = "linear-gradient(135deg, hsl(38 92% 50% / 0.10) 0%, hsl(28 92% 55% / 0.16) 100%)";
  const amberIcon = "linear-gradient(135deg, hsl(38 92% 50% / 0.22) 0%, hsl(28 92% 55% / 0.30) 100%)";
  const blueGrad = "linear-gradient(135deg, hsl(217 91% 55% / 0.10) 0%, hsl(192 92% 50% / 0.16) 100%)";
  const blueIcon = "linear-gradient(135deg, hsl(217 91% 55% / 0.22) 0%, hsl(192 92% 50% / 0.30) 100%)";

  const Metric = ({ icon: Icon, label, value, gradient, iconGradient, iconColor, accentClass, to }: any) => (
    <Link to={to} className={`stat-card group p-5 gap-4 ${accentClass}`} style={{ background: gradient }}>
      <div className="icon-glow w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ background: iconGradient, color: iconColor }}>
        <Icon size={26} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{loading ? "—" : value}</p>
      </div>
    </Link>
  );

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(180deg,#F5F8FB 0%,#EDF5FA 100%)",
      }}
    >

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}, <span className="text-primary">{displayName}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Metric icon={Users} label="Patients This Month" value={monthPatients} gradient={tealGrad} iconGradient={tealIcon} iconColor="hsl(184 78% 40%)" accentClass="accent-teal" to="/patients?filter=thismonth"/>
        <Metric icon={TrendingUp} label={`${currentMonthName} Revenue`} value={`₦${monthlyRevenue.toLocaleString()}`} gradient={navyGrad} iconGradient={navyIcon} iconColor="hsl(217 91% 55%)" accentClass="accent-navy" to={`/billing?month=current`} />
        <Metric icon={DollarSign} label="Pending Bills" value={pendingBills} gradient={amberGrad} iconGradient={amberIcon} iconColor="hsl(38 92% 50%)" accentClass="accent-warning" to="/billing" />
        <Metric
          icon={DollarSign}
          label={`${previousMonthName} Revenue`}
          value={`₦${previousMonthRevenue.toLocaleString()}`}
          gradient={navyGrad}
          iconGradient={navyIcon}
          iconColor="hsl(217 91% 55%)"
          accentClass="accent-navy"
          to={`/billing?month=previous`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Link
          to="/visits?filter=today"
          className="stat-card group p-5 gap-4 accent-teal"
          style={{ background: tealGrad }}
        >
          <div className="icon-glow w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ background: tealIcon, color: "hsl(184 78% 40%)" }}>
            <Clock size={26} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Today's Visits</p>
            <p className="text-2xl font-bold tracking-tight">{loading ? "—" : todayVisits}</p>
          </div>
        </Link>
        <div className="stat-card group p-5 gap-4" style={{ background: blueGrad }}>
          <div className="icon-glow w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ background: blueIcon, color: "hsl(217 91% 55%)" }}>
            <Clock size={26} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Appointments</p>
            <p className="text-2xl font-bold tracking-tight">{loading ? "—" : todayAppointments}</p>
          </div>
        </div>
      </div>

      {(lowStockCount > 0 || drugAlerts > 0) && (
        <Link to="/inventory" className="flex items-center gap-4 rounded-2xl border border-border/60 p-5 mb-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated group" style={{ background: amberGrad }}>
          <div className="icon-glow w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ background: amberIcon, color: "hsl(38 92% 50%)" }}>
            <AlertTriangle size={26} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Stock Alerts</p>
            <p className="text-xs text-muted-foreground">{lowStockCount + drugAlerts} item(s) need attention</p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground shrink-0 transition-colors group-hover:text-foreground" />
        </Link>
      )}

      {upcomingAppts.length > 0 && (
        <div className="medical-card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title"><Clock size={16} /> Today's Schedule</h2>
            <Link to="/visits" className="text-xs text-primary font-medium hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {upcomingAppts.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50 hover:bg-muted transition-all">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock size={14} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.patient_name}</p>
                  <p className="text-xs text-muted-foreground">{a.appointment_time}{a.reason ? ` • ${a.reason}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="medical-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title"><Users size={16} /> Recent Patients</h2>
          <Link to="/patients" className="text-xs text-primary font-medium hover:underline">View all</Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <OptoLoader size={40} />
          </div>
        ) : recentPatients.length === 0 ? (
          <EmptyState compact icon={Users} title="No patients registered yet" description="Patients you add will appear here." />
        ) : (
          <div className="space-y-3">
            {recentPatients.map((p: any) => (
              <Link key={p.id} to={`/patient/${p.id}`}
                className="
flex items-center gap-3
p-3
rounded-2xl
border
bg-card
shadow-sm
hover:shadow-md
hover:-translate-y-0.5
transition-all
group
">
                <div
  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
  style={{
    background:
      "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)",
  }}
>
                  <span className="text-lg font-bold text-white">
  {(p.full_name || "?")[0]}
</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.full_name}</p>
                    <span className="text-[10px] font-mono text-muted-foreground">#{p.queue_number}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.gender}, {p.age} yrs • {p.phone}
                  </p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
      <FinanceOverview />
    </div>

  );
}
