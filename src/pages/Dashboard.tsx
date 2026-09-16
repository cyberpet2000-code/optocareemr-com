import OptoLoader from "@/components/OptoLoader";
import EmptyState from "@/components/EmptyState";
import { useState, useEffect, useCallback } from "react";
import {
  enableNotifications,
  showNotification,
} from "@/lib/notifications";
import {
  checkClinicSubscription,
} from "@/lib/diag/healthChecks";
import { Link } from "react-router-dom";
import { Users, ChevronRight, AlertTriangle, DollarSign, TrendingUp, Clock } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { startLoadingWatch,
  stopLoadingWatch, checkQueryFailure,} from "@/lib/diag";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { offlineStore } from "@/lib/offlineStore";
import { useOffline } from "@/hooks/useOffline";
import FinanceOverview from "@/components/dashboard/FinanceOverview";
import PatientHistoryMeta from "@/components/patients/PatientHistoryMeta";
import { buildBillingSummaryMap, buildVisitSummaryMap, getPaymentStatus } from "@/lib/patientHistory";

interface DashboardSnapshot {
  todayVisits: number;
  monthPatients: number;
  patientsSeen?: number;
  newPatientsSeen?: number;
  returningPatients?: number;
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
  const { isAdmin, isDoctor, isReceptionist, loading: roleLoading } = useRole();
  
  // Determine which sections to show based on role
  const showClinicalMetrics = isDoctor || isAdmin;
  const showBillingMetrics = isReceptionist || isAdmin;
  const showFinanceOverview = isAdmin;
  const showInventoryAlerts = isAdmin || isDoctor;
  
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
  const [patientsSeen, setPatientsSeen] = useState(0);
  const [newPatientsSeen, setNewPatientsSeen] = useState(0);
  const [returningPatients, setReturningPatients] = useState(0);
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
  const [feedbackFollowups, setFeedbackFollowups] = useState<any[]>([]);
  const [staffRating, setStaffRating] = useState<number | null>(null);
  const [staffRatingCount, setStaffRatingCount] = useState(0);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = user?.user_metadata?.full_name || "User";
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
    
    if (roleLoading) {
      console.debug("[dashboard] role still loading, deferring fetch");
      return;
    }
    
    // Fail safely if role cannot be determined
    if (!isAdmin && !isDoctor && !isReceptionist) {
      console.warn("[dashboard] user role cannot be determined, failing safely");
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
    const { data: feedbackFollowupData, error: feedbackFollowupError } =
  await apiClient.rpc("get_dashboard_feedback_followups", {
    p_clinic_id: cid,
  });

checkQueryFailure(
  "get_dashboard_feedback_followups",
  "feedback follow-ups",
  feedbackFollowupError
);

setFeedbackFollowups(feedbackFollowupData ?? []);
    // Load the logged-in staff member's own patient rating
if (user?.id) {
  if (isDoctor && !isAdmin) {
    const { data: ratingRows, error: ratingError } = await apiClient
      .from("feedback_responses")
      .select("doctor_rating")
      .eq("clinic_id", cid)
      .eq("doctor_id", user.id)
      .not("doctor_rating", "is", null);

    if (ratingError) {
      console.error("Failed to load doctor rating:", ratingError);
    } else {
      const ratings = (ratingRows || [])
        .map((row: any) => Number(row.doctor_rating))
        .filter((rating: number) => Number.isFinite(rating));

      setStaffRatingCount(ratings.length);

      setStaffRating(
        ratings.length > 0
          ? Number(
              (
                ratings.reduce((sum, rating) => sum + rating, 0) /
                ratings.length
              ).toFixed(1)
            )
          : null
      );
    }
  } else if (isReceptionist && !isAdmin) {
    const { data: visitRows, error: visitError } = await apiClient
      .from("visits")
      .select("id")
      .eq("clinic_id", cid)
      .eq("registered_by", user.id);

    if (visitError) {
      console.error("Failed to load receptionist visits:", visitError);
    } else {
      const visitIds = (visitRows || []).map((row: any) => row.id);

      if (visitIds.length === 0) {
        setStaffRating(null);
        setStaffRatingCount(0);
      } else {
        const { data: ratingRows, error: ratingError } = await apiClient
          .from("feedback_responses")
          .select("front_desk_rating")
          .eq("clinic_id", cid)
          .in("visit_id", visitIds)
          .not("front_desk_rating", "is", null);

        if (ratingError) {
          console.error(
            "Failed to load receptionist rating:",
            ratingError
          );
        } else {
          const ratings = (ratingRows || [])
            .map((row: any) => Number(row.front_desk_rating))
            .filter((rating: number) => Number.isFinite(rating));

          setStaffRatingCount(ratings.length);

          setStaffRating(
            ratings.length > 0
              ? Number(
                  (
                    ratings.reduce((sum, rating) => sum + rating, 0) /
                    ratings.length
                  ).toFixed(1)
                )
              : null
          );
        }
      }
    }
  }
}
    const cacheKey = `dashboard:${cid}`;

    const hydrateFromCache = () => {
      const snap = offlineStore.get<DashboardSnapshot>(cacheKey);
      if (snap) {
        setMonthPatients(snap.monthPatients ?? 0);
        setPatientsSeen(snap.patientsSeen ?? 0);
        setNewPatientsSeen(snap.newPatientsSeen ?? 0);
        setReturningPatients(snap.returningPatients ?? 0);
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
    };
    
    // Offline: skip network entirely.
    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      hydrateFromCache();
      return;
    }

    setLoading(true);
    startLoadingWatch("dashboard");
    const today = new Date().toISOString().split("T")[0];

    try {
      // Build role-appropriate queries - only fetch data the user's role needs
       const queries: any[] = [];
      const queryKeys: string[] = [];

      // All roles need: patients, visits, appointments, upcoming appointments
      queries.push(
         apiClient.from("patients").select("id, full_name, age, gender, phone, payment_type, active_hmo_id, queue_number, patient_number").eq("clinic_id", cid).order("created_at", { ascending: false }).limit(5)
      );
      queryKeys.push("patients");

      queries.push(
        apiClient.from("visits").select("*", { count: "exact", head: true }).eq("clinic_id", cid).gte("created_at", `${today}T00:00:00`)
      );
      queryKeys.push("visits");

      queries.push(
        apiClient.from("appointments").select("*", { count: "exact", head: true }).eq("clinic_id", cid).gte("appointment_date", today).in("status", ["pending", "confirmed"])
      );
      queryKeys.push("appointments");

      queries.push(
        apiClient.from("appointments").select("id, appointment_date, appointment_time, reason, patient_id").eq("clinic_id", cid).gte("appointment_date", today).in("status", ["pending", "confirmed"]).limit(10)
      );
      queryKeys.push("upcomingAppts");

      // Inventory alerts: only fetch if admin or doctor
      if (showInventoryAlerts) {
        queries.push(
          apiClient.from("inventory").select("*", { count: "exact", head: true }).eq("clinic_id", cid).lte("stock_quantity", 5)
        );
        queryKeys.push("inventory");

        queries.push(
          apiClient.from("drugs").select("*", { count: "exact", head: true }).eq("clinic_id", cid).lte("stock", 5)
        );
        queryKeys.push("drugs");
      }

      // Billing: only fetch if receptionist or admin
      if (showBillingMetrics) {
        queries.push(
          apiClient.from("billing").select("*", { count: "exact", head: true }).eq("clinic_id", cid).eq("status", "pending").gt("total_amount", 0)
        );
        queryKeys.push("pendingBills");
      }

      // Revenue & patient stats: only fetch if admin
      if (showFinanceOverview) {
        queries.push(
          apiClient.rpc("get_dashboard_revenue", {
            p_clinic_id: cid,
            p_year: now.getFullYear(),
            p_month: now.getMonth() + 1,
          })
        );
        queryKeys.push("currentRevenue");

        queries.push(
          apiClient.rpc("get_dashboard_patient_stats", {
            p_clinic_id: cid,
            p_year: now.getFullYear(),
            p_month: now.getMonth() + 1,
          })
        );
        queryKeys.push("patientStats");

        const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        queries.push(
          apiClient.rpc("get_dashboard_revenue", {
            p_clinic_id: cid,
            p_year: previousDate.getFullYear(),
            p_month: previousDate.getMonth() + 1,
          })
        );
        queryKeys.push("previousRevenue");
      }

      const results = await Promise.all(queries);
      const resultMap: Record<string, any> = {};
      results.forEach((result, idx) => {
        resultMap[queryKeys[idx]] = result;
      });

      // Check for errors
      const patientsRes = resultMap.patients;
      const visitsRes = resultMap.visits;
      const apptRes = resultMap.appointments;
      const upcomingApptRes = resultMap.upcomingAppts;
      const invRes = resultMap.inventory;
      const drugRes = resultMap.drugs;
      const pendingBillsRes = resultMap.pendingBills;
      const currentRevenueRes = resultMap.currentRevenue;
      const patientStatsRes = resultMap.patientStats;
      const previousRevenueRes = resultMap.previousRevenue;

      checkQueryFailure("patients", "recent patients", patientsRes?.error);
      checkQueryFailure("visits", "today visits", visitsRes?.error);
      checkQueryFailure("appointments", "today appointments", apptRes?.error);
      checkQueryFailure("appointments", "upcoming appointments", upcomingApptRes?.error);
      
      if (showInventoryAlerts) {
        checkQueryFailure("inventory", "low stock check", invRes?.error);
        checkQueryFailure("drugs", "low stock drugs", drugRes?.error);
      }
      
      if (showBillingMetrics) {
        checkQueryFailure("billing", "pending bills", pendingBillsRes?.error);
      }
      
      if (showFinanceOverview) {
        checkQueryFailure("get_dashboard_revenue", "current month revenue", currentRevenueRes?.error);
        checkQueryFailure("get_dashboard_patient_stats", "patient statistics", patientStatsRes?.error);
        checkQueryFailure("get_dashboard_revenue", "previous month revenue", previousRevenueRes?.error);
      }

      // Diagnostic checks for data consistency
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
        console.warn(`[DIAG] patients missing clinic_id: ${patientsMissing}`);
      }

      if ((visitsMissing || 0) > 0) {
        console.warn(`[DIAG] visits missing clinic_id: ${visitsMissing}`);
      }

      if ((appointmentsMissing || 0) > 0) {
        console.warn(`[DIAG] appointments missing clinic_id: ${appointmentsMissing}`);
      }

      if ((billingMissing || 0) > 0) {
        console.warn(`[DIAG] billing missing clinic_id: ${billingMissing}`);
      }

      // Parse patient stats
      let patientStats = { patients_seen: 0, new_patients_seen: 0, returning_patients: 0 };
      if (patientStatsRes) {
        const statsData = Array.isArray(patientStatsRes.data)
          ? patientStatsRes.data[0]
          : patientStatsRes.data;
        if (statsData) {
          patientStats = {
            patients_seen: Number(statsData.patients_seen ?? 0),
            new_patients_seen: Number(statsData.new_patients_seen ?? 0),
            returning_patients: Number(statsData.returning_patients ?? 0),
          };
        }
      }

       const recentPatientRows = (patientsRes?.data as any[]) ?? [];
       const recentPatientIds = recentPatientRows.map((p) => p.id).filter(Boolean);
       const [recentVisitsRes, recentBillsRes] = recentPatientIds.length > 0
         ? await Promise.all([
             apiClient.from("visits").select("patient_id, created_at").eq("clinic_id", cid).in("patient_id", recentPatientIds),
             showBillingMetrics
               ? apiClient.from("billing").select("patient_id, balance, amount_paid, status, payer_type").eq("clinic_id", cid).in("patient_id", recentPatientIds)
               : Promise.resolve({ data: [] }),
           ])
         : [{ data: [] }, { data: [] }];
        const recentHmoIds = [...new Set(recentPatientRows.map((p) => p.active_hmo_id).filter(Boolean))];
        const { data: recentHmos } = recentHmoIds.length > 0
          ? await apiClient.from("hmos").select("id, name").eq("clinic_id", cid).in("id", recentHmoIds)
          : { data: [] };
        const recentHmoMap = new Map((recentHmos || []).map((h: any) => [h.id, h.name]));
       const paymentTypes = new Map(recentPatientRows.map((p) => [p.id, p.payment_type]));
       const visitSummaryMap = buildVisitSummaryMap(recentVisitsRes.data || []);
       const billingSummaryMap = buildBillingSummaryMap(recentBillsRes.data || [], paymentTypes);
       const recentPatientsWithHistory = recentPatientRows.map((p) => ({
         ...p,
          hmo_name: p.active_hmo_id ? recentHmoMap.get(p.active_hmo_id) : undefined,
         visitSummary: visitSummaryMap.get(p.id) || { visitCount: 0, lastVisit: null },
          billingSummary: showBillingMetrics
            ? billingSummaryMap.get(p.id) || getPaymentStatus([], p.payment_type)
            : getPaymentStatus([], p.payment_type),
       }));

       const snap: DashboardSnapshot = {
        monthPatients: patientStats.patients_seen,
        patientsSeen: patientStats.patients_seen,
        newPatientsSeen: patientStats.new_patients_seen,
        returningPatients: patientStats.returning_patients,
        todayVisits: visitsRes?.count ?? 0,
        todayAppointments: apptRes?.count ?? 0,
        pendingBills: pendingBillsRes?.count ?? 0,
        monthlyRevenue: Number(currentRevenueRes?.data ?? 0),
        previousMonthRevenue: Number(previousRevenueRes?.data ?? 0),
        lowStockCount: invRes?.count ?? 0,
        drugAlerts: drugRes?.count ?? 0,
         recentPatients: recentPatientsWithHistory,
        upcomingAppts: (upcomingApptRes?.data as any[]) ?? [],
      };

      setMonthPatients(snap.monthPatients);
      setPatientsSeen(snap.patientsSeen ?? 0);
      setNewPatientsSeen(snap.newPatientsSeen ?? 0);
      setReturningPatients(snap.returningPatients ?? 0);
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
      const cidFallback = effectiveClinicId;
      const cacheKeyFallback = `dashboard:${cidFallback}`;
      const snap = offlineStore.get<DashboardSnapshot>(cacheKeyFallback);
      if (snap) {
        setMonthPatients(snap.monthPatients ?? 0);
        setPatientsSeen(snap.patientsSeen ?? 0);
        setNewPatientsSeen(snap.newPatientsSeen ?? 0);
        setReturningPatients(snap.returningPatients ?? 0);
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
  }, [effectiveClinicId, isOffline, showClinicalMetrics, showBillingMetrics, showFinanceOverview, showInventoryAlerts, roleLoading, isAdmin, isDoctor, isReceptionist]);

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

  // Show loading state while role is being resolved
  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <OptoLoader size={48} label="Loading your dashboard..." />
      </div>
    );
  }

  // Fail safely if role cannot be determined
  if (!isAdmin && !isDoctor && !isReceptionist) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-lg font-semibold">Access Error</h1>
          <p className="text-sm text-muted-foreground">
            Your role could not be determined. Please contact support.
          </p>
        </div>
      </div>
    );
  }

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

      {/* DOCTOR SECTION: Clinical workflow */}
      {isDoctor && !isAdmin && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Metric icon={Users} label="Patients This Month" value={monthPatients} gradient={tealGrad} iconGradient={tealIcon} iconColor="hsl(184 78% 40%)" accentClass="accent-teal" to="/patients?filter=month" />
            <Metric icon={Clock} label="Today's Visits" value={todayVisits} gradient={blueGrad} iconGradient={blueIcon} iconColor="hsl(217 91% 55%)" accentClass="accent-navy" to="/visits?filter=today" />
            <Metric icon={Clock} label="Appointments" value={todayAppointments} gradient={amberGrad} iconGradient={amberIcon} iconColor="hsl(38 92% 50%)" accentClass="accent-warning" to="/appointments" />
            <Metric icon={TrendingUp} label="Follow-ups" value={feedbackFollowups} gradient={navyGrad} iconGradient={navyIcon} iconColor="hsl(217 91% 55%)" accentClass="accent-navy" to="/patients?filter=followup" />
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
                <Link to="/appointments" className="text-xs text-primary font-medium hover:underline">View all</Link>
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
                    className="flex items-center gap-3 p-3 rounded-2xl border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
                      style={{
                        background: "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)",
                      }}
                    >
                      <span className="text-lg font-bold text-white">
                        {(p.full_name || "?")[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{p.full_name}</p>
                         <span className="text-[10px] font-mono text-muted-foreground">{p.patient_number || `#${p.queue_number}`}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.gender}, {p.age} yrs • {p.phone}
                      </p>
                       <PatientHistoryMeta visits={p.visitSummary} billing={p.billingSummary} paymentType={p.payment_type} hmoName={p.hmo_name} compact />
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECEPTIONIST SECTION: Front-desk workflow */}
      {isReceptionist && !isAdmin && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Metric icon={Clock} label="Today's Appointments" value={todayAppointments} gradient={tealGrad} iconGradient={tealIcon} iconColor="hsl(184 78% 40%)" accentClass="accent-teal" to="/appointments" />
            <Metric icon={Users} label="Recent Patients" value={recentPatients.length} gradient={blueGrad} iconGradient={blueIcon} iconColor="hsl(217 91% 55%)" accentClass="accent-navy" to="/patients" />
            <Metric icon={DollarSign} label="Pending Bills" value={pendingBills} gradient={amberGrad} iconGradient={amberIcon} iconColor="hsl(38 92% 50%)" accentClass="accent-warning" to="/billing" />
            <Metric
  icon={TrendingUp}
  label="Follow-ups"
  value={feedbackFollowups.length}
  gradient={navyGrad}
  iconGradient={navyIcon}
  iconColor="hsl(217 91% 55%)"
  accentClass="accent-navy"
  to="/patients?filter=followup"
/>
          </div>

          {upcomingAppts.length > 0 && (
            <div className="medical-card mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title"><Clock size={16} /> Today's Appointments</h2>
                <Link to="/appointments" className="text-xs text-primary font-medium hover:underline">View all</Link>
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
              <EmptyState compact icon={Users} title="No patients registered yet" description="Patients you register will appear here." />
            ) : (
              <div className="space-y-3">
                {recentPatients.map((p: any) => (
                  <Link key={p.id} to={`/patient/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-2xl border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
                      style={{
                        background: "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)",
                      }}
                    >
                      <span className="text-lg font-bold text-white">
                        {(p.full_name || "?")[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{p.full_name}</p>
                         <span className="text-[10px] font-mono text-muted-foreground">{p.patient_number || `#${p.queue_number}`}</span>
                      </div>
                       <p className="text-xs text-muted-foreground">
                         {p.gender}, {p.age} yrs • {p.phone}
                       </p>
                        <PatientHistoryMeta visits={p.visitSummary} billing={p.billingSummary} paymentType={p.payment_type} hmoName={p.hmo_name} compact />
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADMIN SECTION: Full dashboard with finance & operations */}
      {isAdmin && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Metric icon={Users} label="Patients This Month" value={monthPatients} gradient={tealGrad} iconGradient={tealIcon} iconColor="hsl(184 78% 40%)" accentClass="accent-teal" to="/patients?filter=month" />
            <Metric icon={TrendingUp} label={`${currentMonthName} Revenue`} value={`₦${monthlyRevenue.toLocaleString()}`} gradient={navyGrad} iconGradient={navyIcon} iconColor="hsl(217 91% 55%)" accentClass="accent-navy" to="/billing" />
            <Metric icon={DollarSign} label="Pending Bills" value={pendingBills} gradient={amberGrad} iconGradient={amberIcon} iconColor="hsl(38 92% 50%)" accentClass="accent-warning" to="/billing" />
            <Metric
              icon={DollarSign}
              label={`${previousMonthName} Revenue`}
              value={`₦${previousMonthRevenue.toLocaleString()}`}
              gradient={navyGrad}
              iconGradient={navyIcon}
              iconColor="hsl(217 91% 55%)"
              accentClass="accent-navy"
              to="/billing?month=previous"
            />
            <Metric
  icon={TrendingUp}
  label="Follow-ups"
  value={feedbackFollowups.length}
  gradient={navyGrad}
  iconGradient={navyIcon}
  iconColor="hsl(217 91% 55%)"
  accentClass="accent-navy"
  to="/patients?filter=followup"
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
                <Link to="/appointments" className="text-xs text-primary font-medium hover:underline">View all</Link>
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
                    className="flex items-center gap-3 p-3 rounded-2xl border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
                      style={{
                        background: "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)",
                      }}
                    >
                      <span className="text-lg font-bold text-white">
                        {(p.full_name || "?")[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{p.full_name}</p>
                         <span className="text-[10px] font-mono text-muted-foreground">{p.patient_number || `#${p.queue_number}`}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.gender}, {p.age} yrs • {p.phone}
                      </p>
                       <PatientHistoryMeta visits={p.visitSummary} billing={p.billingSummary} paymentType={p.payment_type} hmoName={p.hmo_name} compact />
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Finance Overview - Admin only */}
          <FinanceOverview />
        </div>
      )}
    </div>
  );
}
