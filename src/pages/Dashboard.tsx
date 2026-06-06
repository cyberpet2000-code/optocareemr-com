import { useState, useEffect, useCallback } from "react";
import {
  enableNotifications,
  showNotification,
} from "@/lib/notifications";
import { Link, useSearchParams } from "react-router-dom";
import { Users, ChevronRight, AlertTriangle, DollarSign, TrendingUp, Clock } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useClinic } from "@/hooks/useClinic";
import { offlineStore } from "@/lib/offlineStore";
import { useOffline } from "@/hooks/useOffline";

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
      setLoading(false);
      return;
    }
    const cid = effectiveClinicId;
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
      setLoading(false);
    };

    // Offline: skip network entirely.
    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      hydrateFromCache();
      return;
    }

    setLoading(true);
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
        apiClient.from("inventory").select("*", { count: "exact", head: true }).eq("clinic_id", cid).lte("quantity", 5),
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
        apiClient.from("billing").select("total_amount").eq("clinic_id", cid).eq("status", "paid").gte("created_at", previousMonthStart).lt("created_at", monthStart),
        apiClient.from("drugs").select("*", { count: "exact", head: true }).eq("clinic_id", cid).lte("quantity", 5),
      ]);

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

      console.log("Revenue rows", revenueRes.data);
console.log("Current month revenue", currentMonthRevenue);
      const snap: DashboardSnapshot = {
        monthPatients: monthPatientsRes.count ?? 0,
        todayVisits: visitsRes.count ?? 0,
        todayAppointments: apptRes.count ?? 0,
        pendingBills: billRes.count ?? 0,
        monthlyRevenue: sumAmount(revenueRes.data),
        previousMonthRevenue: sumAmount(prevRevenueRes.data),
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

  const Metric = ({ icon: Icon, label, value, color, to }: any) => (
    <Link to={to} className="stat-card group">
      <div className={`w-11 h-11 rounded-2xl ${color} flex items-center justify-center shrink-0`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold tracking-tight">{loading ? "—" : value}</p>
      </div>
    </Link>
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}, <span className="text-primary">{displayName}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Metric icon={Users} label="Patients This Month" value={monthPatients} color="bg-primary/10 text-primary" to="/patients?filter=thismonth"/>
        <Metric icon={TrendingUp} label={`${currentMonthName} Revenue`} value={`₦${monthlyRevenue.toLocaleString()}`} color="bg-success/10 text-success" to={`/billing?month=current`} />
        <Metric icon={DollarSign} label="Pending Bills" value={pendingBills} color="bg-warning/10 text-warning" to="/billing" />
        <Metric
          icon={DollarSign}
          label={`${previousMonthName} Revenue`}
          value={`₦${previousMonthRevenue.toLocaleString()}`}
          color="bg-accent/10 text-accent"
          to={`/billing?month=previous`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link
          to="/visits?filter=today"
          className="stat-card"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Clock className="text-accent" size={18} />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Today's Visits</p>
            <p className="text-lg font-bold">{loading ? "—" : todayVisits}</p>
          </div>
        </Link>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="text-primary" size={18} />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Appointments</p>
            <p className="text-lg font-bold">{loading ? "—" : todayAppointments}</p>
          </div>
        </div>
      </div>

      {(lowStockCount > 0 || drugAlerts > 0) && (
        <Link to="/inventory" className="flex items-center gap-3 bg-destructive/5 border border-destructive/15 rounded-2xl p-4 mb-6 hover:bg-destructive/10 transition-all">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-destructive" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Stock Alerts</p>
            <p className="text-xs text-muted-foreground">{lowStockCount + drugAlerts} item(s) need attention</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
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
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : recentPatients.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No patients registered yet.</p>
        ) : (
          <div className="space-y-1">
            {recentPatients.map((p: any) => (
              <Link key={p.id} to={`/patient/${p.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-all group">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{(p.full_name || "?")[0]}</span>
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
    </>
  );
}
