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
import { PatientWhatsAppMessages } from "@/components/PatientWhatsAppMessages";
import { Users, ChevronRight, AlertTriangle, TrendingUp, Clock, Star, CalendarDays, CheckCircle2, CircleDot, BellRing } from "lucide-react";
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
  monthRegisteredPatients?: number;
  monthlyRevenue: number;
  todayAppointments: number;
  pendingBills: number;
  lowStockCount: number;
  drugAlerts: number;
  recentPatients: any[];
  upcomingAppts: any[];
}

interface StaffFeedbackRow {
  feedback_id: string;
  staff_id: string | null;
  staff_name: string;
  staff_role: "doctor" | "receptionist";
  rating: number | null;
  visit_id: string;
  patient_id: string;
  patient_name: string;
  submitted_at: string;
  positive_feedback: string | null;
  improvement_feedback: string | null;
  what_did_well: string | null;
  what_can_improve: string | null;
  anything_else: string | null;
}

export default function Dashboard() {
  useEffect(() => {
    enableNotifications();
  }, []);
  const { user } = useAuth();
  const { effectiveClinicId } = useClinic();
  const { isAdmin, isDoctor, isReceptionist, isSuperAdmin, loading: roleLoading } = useRole();
  
  // Determine which sections to show based on role
  const showBillingMetrics = isReceptionist || isAdmin || isSuperAdmin;
  const showFinanceOverview = isAdmin || isSuperAdmin;
  const showInventoryAlerts = isAdmin || isDoctor || isSuperAdmin;
  
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
  const [monthRegisteredPatients, setMonthRegisteredPatients] = useState(0);
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
  const [staffFeedback, setStaffFeedback] = useState<StaffFeedbackRow[]>([]);
  const [staffFeedbackLoading, setStaffFeedbackLoading] = useState(false);
  const [staffFeedbackError, setStaffFeedbackError] = useState<string | null>(null);
  const [appointmentReminderDue, setAppointmentReminderDue] = useState(0);
  const [birthdayPatients, setBirthdayPatients] = useState<any[]>([]);
  const [birthdayLoading, setBirthdayLoading] = useState(false);

  useEffect(() => {
    if (!effectiveClinicId || isDoctor && !isAdmin && !isSuperAdmin) return;
    let cancelled = false;
    const loadDueReminders = async () => {
      const { data, error } = await apiClient.rpc("refresh_due_appointment_reminders");
      if (error || cancelled) return;
      const { count, error: countError } = await apiClient
        .from("appointment_reminders")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", effectiveClinicId)
        .eq("status", "due")
        .is("sent_at", null);
      if (!countError && !cancelled) setAppointmentReminderDue(count || 0);
    };
    loadDueReminders();
    const timer = window.setInterval(loadDueReminders, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [effectiveClinicId, isDoctor, isAdmin, isSuperAdmin]);

  useEffect(() => {
    if (!effectiveClinicId || isOffline) { setBirthdayPatients([]); return; }
    let cancelled = false;
    const loadBirthdays = async () => {
      setBirthdayLoading(true);
      const { data, error } = await apiClient.from("patients").select("id, full_name, date_of_birth, phone, patient_number").eq("clinic_id", effectiveClinicId).not("date_of_birth", "is", null).order("full_name", { ascending: true });
      if (!cancelled) {
        if (error) { console.error("Failed to load today's birthdays:", error); setBirthdayPatients([]); }
        else {
          const today = new Date(); const month = today.getMonth() + 1; const day = today.getDate();
          setBirthdayPatients((data || []).filter((patient: any) => { const dob = new Date(patient.date_of_birth + "T00:00:00"); return dob.getMonth() + 1 === month && dob.getDate() === day; }));
        }
        setBirthdayLoading(false);
      }
    };
    void loadBirthdays();
    return () => { cancelled = true; };
  }, [effectiveClinicId, isOffline]);

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
    if (!isAdmin && !isSuperAdmin && !isDoctor && !isReceptionist) {
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

        // Admin and Super Admin see staff ratings for the active clinic.
    // Super Admin ratings are always scoped to the currently selected clinic.
    if (isAdmin || isSuperAdmin) {
      setStaffFeedbackLoading(true);
      setStaffFeedbackError(null);

      const { data: staffFeedbackData, error: staffFeedbackError } =
        await apiClient.rpc("get_admin_staff_feedback_ratings", {
          p_clinic_id: cid,
        });

      if (staffFeedbackError) {
        console.error(
          "Failed to load staff ratings:",
          staffFeedbackError
        );
        setStaffFeedback([]);
        setStaffFeedbackError(
          staffFeedbackError.message || "Failed to load staff ratings"
        );
      } else {
        setStaffFeedback(
          (staffFeedbackData || []) as StaffFeedbackRow[]
        );
      }

      setStaffFeedbackLoading(false);
    } else {
      setStaffFeedback([]);
      setStaffFeedbackError(null);
    }
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
        setMonthRegisteredPatients(snap.monthRegisteredPatients ?? 0);
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
    const localToday = new Date();
    const today = [
      localToday.getFullYear(),
      String(localToday.getMonth() + 1).padStart(2, "0"),
      String(localToday.getDate()).padStart(2, "0"),
    ].join("-");

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

      // Dashboard schedule is strictly for the current local clinic day.
      // Do not use UTC date conversion here because Cedar Eye Clinic operates in Africa/Lagos.
      queries.push(
        apiClient
          .from("appointments")
          .select("id, appointment_date, appointment_time, reason, patient_id, doctor_id, status, priority")
          .eq("clinic_id", cid)
          .eq("appointment_date", today)
          .in("status", ["pending", "confirmed"])
          .order("appointment_time", { ascending: true })
          .limit(20)
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

      // Monthly patient activity is useful to doctors and management.
      if (isDoctor || showFinanceOverview) {
        queries.push(
          apiClient.rpc("get_dashboard_patient_stats", {
            p_clinic_id: cid,
            p_year: now.getFullYear(),
            p_month: now.getMonth() + 1,
          })
        );
        queryKeys.push("patientStats");
      }

      // Revenue remains restricted to admin/super_admin.
      if (showFinanceOverview) {
        queries.push(
          apiClient.rpc("get_dashboard_revenue", {
            p_clinic_id: cid,
            p_year: now.getFullYear(),
            p_month: now.getMonth() + 1,
          })
        );
        queryKeys.push("currentRevenue");

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

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      queries.push(
        apiClient
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", cid)
          .gte("created_at", monthStart.toISOString())
      );
      queryKeys.push("monthRegisteredPatients");

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
      
      if (isDoctor || showFinanceOverview) {
        checkQueryFailure("get_dashboard_patient_stats", "patient statistics", patientStatsRes?.error);
      }
      if (showFinanceOverview) {
        checkQueryFailure("get_dashboard_revenue", "current month revenue", currentRevenueRes?.error);
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
        monthRegisteredPatients: resultMap.monthRegisteredPatients?.count ?? 0,
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

      // Enrich today's schedule with patient and doctor names for a useful
      // front-desk/clinical view instead of showing IDs or sparse rows.
      const scheduleRows = snap.upcomingAppts;
      const schedulePatientIds = [...new Set(scheduleRows.map((a: any) => a.patient_id).filter(Boolean))];
      const scheduleDoctorIds = [...new Set(scheduleRows.map((a: any) => a.doctor_id).filter(Boolean))];

      const [schedulePatientsRes, scheduleDoctorsRes] = await Promise.all([
        schedulePatientIds.length > 0
          ? apiClient.from("patients").select("id, full_name, patient_number, phone").eq("clinic_id", cid).in("id", schedulePatientIds)
          : Promise.resolve({ data: [] }),
        scheduleDoctorIds.length > 0
          ? apiClient.from("profiles").select("id, full_name, is_super_admin").in("id", scheduleDoctorIds)
          : Promise.resolve({ data: [] }),
      ]);

      const schedulePatientMap = new Map(
        (schedulePatientsRes.data || []).map((p: any) => [p.id, p])
      );
      const scheduleDoctorMap = new Map(
        (scheduleDoctorsRes.data || [])
          .filter((d: any) => d.is_super_admin !== true)
          .map((d: any) => [d.id, d.full_name || "Doctor"])
      );

      snap.upcomingAppts = scheduleRows.map((a: any) => ({
        ...a,
        patient_name: a.patient_id
          ? (schedulePatientMap.get(a.patient_id)?.full_name || "Unknown patient")
          : "Walk-in",
        patient_number: a.patient_id
          ? (schedulePatientMap.get(a.patient_id)?.patient_number || null)
          : null,
        patient_phone: a.patient_id
          ? (schedulePatientMap.get(a.patient_id)?.phone || null)
          : null,
        doctor_name: a.doctor_id
          ? (scheduleDoctorMap.get(a.doctor_id) || null)
          : null,
      }));

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
  }, [effectiveClinicId, isOffline, showBillingMetrics, showFinanceOverview, showInventoryAlerts, roleLoading, isAdmin, isDoctor, isReceptionist, isSuperAdmin]);

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

  const NairaIcon = ({ size = 19 }: { size?: number }) => <span style={{ fontSize: size, lineHeight: 1, fontWeight: 700 }}>₦</span>;

  const tealGrad = "linear-gradient(135deg, hsl(184 78% 40% / 0.08) 0%, hsl(192 92% 50% / 0.12) 100%)";
  const navyGrad = "linear-gradient(135deg, hsl(222 65% 16% / 0.06) 0%, hsl(217 91% 55% / 0.12) 100%)";
  const amberGrad = "linear-gradient(135deg, hsl(38 92% 50% / 0.08) 0%, hsl(28 92% 55% / 0.12) 100%)";
  const blueGrad = "linear-gradient(135deg, hsl(217 91% 55% / 0.08) 0%, hsl(192 92% 50% / 0.12) 100%)";

  const Metric = ({ icon: Icon, label, value, gradient, iconColor, to, hint }: any) => (
    <Link
      to={to}
      className="group flex min-h-[88px] items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: gradient }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/80"
        style={{ color: iconColor }}
      >
        <Icon size={19} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-bold tracking-tight">{loading ? "—" : value}</p>
        {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </Link>
  );

  const SectionHeader = ({ title, subtitle, to, action = "View all" }: any) => (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {to && <Link to={to} className="shrink-0 text-xs font-medium text-primary hover:underline">{action}</Link>}
    </div>
  );

  const roleLabel = isDoctor ? "Clinical dashboard" : isReceptionist ? "Front desk dashboard" : isSuperAdmin ? "System management dashboard" : "Clinic management dashboard";

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg,#F7FAFC 0%,#EEF5F9 100%)" }}
    >
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {getGreeting()}, <span className="text-primary">{displayName}</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <span className="w-fit rounded-full border bg-card px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          {roleLabel}
        </span>
      </div>

      {!isAdmin && (isDoctor || isReceptionist) && (
        <div className="mb-5 inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
          <Star size={14} className="fill-current text-amber-500" />
          {staffRating !== null ? (
            <span className="text-xs font-medium">{staffRating.toFixed(1)} · {staffRatingCount} patient rating{staffRatingCount === 1 ? "" : "s"}</span>
          ) : (
            <span className="text-xs text-muted-foreground">No patient ratings yet</span>
          )}
        </div>
      )}

      {appointmentReminderDue > 0 && (isReceptionist || isAdmin || isSuperAdmin) && (
        <Link to="/appointments" className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-3.5 shadow-sm transition-colors hover:bg-amber-50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <BellRing size={17} className="text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">{appointmentReminderDue} appointment reminder{appointmentReminderDue === 1 ? "" : "s"} due</p>
            <p className="mt-0.5 text-xs text-amber-800/80">Open Appointments to prepare and send the WhatsApp reminder.</p>
          </div>
          <ChevronRight size={16} className="mt-1 shrink-0 text-amber-700" />
        </Link>
      )}

      {/* TODAY */}
      <section className="mb-6">
        <SectionHeader title="Today" subtitle="The information that needs attention now." />
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {isDoctor && !isAdmin && (
            <>
              <Metric icon={Users} label="Patients today" value={todayVisits} gradient={tealGrad} iconColor="hsl(184 78% 40%)" to="/visits?filter=today" />
              <Metric icon={CalendarDays} label="Appointments" value={todayAppointments} gradient={blueGrad} iconColor="hsl(217 91% 55%)" to="/appointments" />
              <Metric icon={TrendingUp} label="Follow-ups" value={feedbackFollowups.length} gradient={navyGrad} iconColor="hsl(217 91% 55%)" to="/patients?filter=followup" />
              <Metric icon={AlertTriangle} label="Stock alerts" value={lowStockCount + drugAlerts} gradient={amberGrad} iconColor="hsl(38 92% 50%)" to="/inventory" hint={lowStockCount + drugAlerts ? "Needs attention" : "All clear"} />
            </>
          )}

          {isReceptionist && !isAdmin && (
            <>
              <Metric icon={CalendarDays} label="Appointments" value={todayAppointments} gradient={tealGrad} iconColor="hsl(184 78% 40%)" to="/appointments" />
              <Metric icon={Users} label="New registrations" value={recentPatients.length} gradient={blueGrad} iconColor="hsl(217 91% 55%)" to="/patients" hint="Latest patients" />
              <Metric icon={NairaIcon} label="Pending bills" value={pendingBills} gradient={amberGrad} iconColor="hsl(38 92% 50%)" to="/billing" />
              <Metric icon={BellRing} label="Reminders due" value={appointmentReminderDue} gradient={navyGrad} iconColor="hsl(217 91% 55%)" to="/appointments" hint={appointmentReminderDue ? "Send now" : "All clear"} />
            </>
          )}

          {(isAdmin || isSuperAdmin) && (
            <>
              <Metric icon={Users} label="Patients today" value={todayVisits} gradient={tealGrad} iconColor="hsl(184 78% 40%)" to="/visits?filter=today" />
              <Metric icon={CalendarDays} label="Appointments" value={todayAppointments} gradient={blueGrad} iconColor="hsl(217 91% 55%)" to="/appointments" />
              <Metric icon={NairaIcon} label="Pending bills" value={pendingBills} gradient={amberGrad} iconColor="hsl(38 92% 50%)" to="/billing" />
              <Metric icon={BellRing} label="Reminders due" value={appointmentReminderDue} gradient={navyGrad} iconColor="hsl(217 91% 55%)" to="/appointments" hint={appointmentReminderDue ? "Front desk action" : "All clear"} />
            </>
          )}
        </div>
      </section>

      {(isReceptionist || isAdmin || isSuperAdmin) && (birthdayLoading || birthdayPatients.length > 0) && (
        <section className="mb-6">
          <div className="medical-card overflow-hidden">
            <SectionHeader title="🎂 Today's Birthdays" subtitle="Patients celebrating today." />
            {birthdayLoading ? <div className="py-4 text-sm text-muted-foreground">Loading birthdays...</div> : (
              <div className="space-y-2">
                {birthdayPatients.map((patient: any) => (
                  <div key={patient.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link to={"/patient/" + patient.id} className="min-w-0 flex-1 hover:text-primary">
                      <p className="truncate text-sm font-semibold">{patient.full_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{patient.patient_number || "Patient"}</p>
                    </Link>
                    <PatientWhatsAppMessages clinicId={effectiveClinicId || ""} clinicName="Clinic" patientId={patient.id} patientName={patient.full_name} phone={patient.phone} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* DOCTOR MONTH VIEW */}
      {isDoctor && !isAdmin && (
        <section className="mb-6">
          <SectionHeader
            title={`${currentMonthName} at a glance`}
            subtitle="Clinical activity for this month."
          />
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <Metric icon={Users} label="Patients seen" value={patientsSeen} gradient={tealGrad} iconColor="hsl(184 78% 40%)" to="/patients" />
            <Metric icon={Users} label="New patients" value={newPatientsSeen} gradient={blueGrad} iconColor="hsl(217 91% 55%)" to="/patients" />
            <Metric icon={TrendingUp} label="Returning" value={returningPatients} gradient={navyGrad} iconColor="hsl(217 91% 55%)" to="/patients" />
          </div>
        </section>
      )}

      {/* RECEPTION MONTH VIEW */}
      {isReceptionist && !isAdmin && (
        <section className="mb-6">
          <SectionHeader
            title={`${currentMonthName} at a glance`}
            subtitle="Front-desk registration activity."
          />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <Metric icon={Users} label="Registered" value={monthRegisteredPatients} gradient={tealGrad} iconColor="hsl(184 78% 40%)" to="/patients" />
            <Metric icon={CalendarDays} label="Appointments" value={todayAppointments} gradient={blueGrad} iconColor="hsl(217 91% 55%)" to="/appointments" hint="Today" />
            <Metric icon={NairaIcon} label="Pending bills" value={pendingBills} gradient={amberGrad} iconColor="hsl(38 92% 50%)" to="/billing" />
          </div>
        </section>
      )}

      {(isDoctor || isReceptionist || isAdmin || isSuperAdmin) && (
        <section className="mb-6">
          <TodaySchedule appointments={upcomingAppts} loading={loading} />
        </section>
      )}

      {(isDoctor || isReceptionist || isAdmin || isSuperAdmin) && (
        <section className="mb-6">
          <div className="medical-card">
            <SectionHeader title="Recent patients" to="/patients" />
            {loading ? (
              <div className="flex items-center justify-center py-7"><OptoLoader size={36} /></div>
            ) : recentPatients.length === 0 ? (
              <EmptyState compact icon={Users} title="No patients registered yet" description="Patients you add will appear here." />
            ) : (
              <div className="grid gap-2.5 lg:grid-cols-2">
                {recentPatients.map((p: any) => (
                  <Link
                    key={p.id}
                    to={`/patient/${p.id}`}
                    className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-2.5 transition-all hover:border-primary/30 hover:bg-primary/[0.03]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <span className="text-sm font-bold">{(p.full_name || "?")[0]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{p.full_name}</p>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{p.patient_number || `#${p.queue_number}`}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{p.gender}, {p.age} yrs · {p.phone || "No phone"}</p>
                      <PatientHistoryMeta visits={p.visitSummary} billing={p.billingSummary} paymentType={p.payment_type} hmoName={p.hmo_name} compact />
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ADMIN / SUPER ADMIN MANAGEMENT */}
      {(isAdmin || isSuperAdmin) && (
        <div className="space-y-6">
          <FinanceOverview />
          {(lowStockCount > 0 || drugAlerts > 0 || pendingBills > 0 || appointmentReminderDue > 0) && (
            <div className="medical-card">
              <SectionHeader title="Needs attention" subtitle="Items that may need staff action." />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {appointmentReminderDue > 0 && (
                  <Link to="/appointments" className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 hover:bg-amber-50">
                    <BellRing size={16} className="mb-2 text-amber-700" />
                    <p className="text-xs font-semibold">Reminders</p>
                    <p className="text-lg font-bold">{appointmentReminderDue}</p>
                    <p className="text-[10px] text-muted-foreground">Due now</p>
                  </Link>
                )}
                {pendingBills > 0 && (
                  <Link to="/billing" className="rounded-xl border bg-card p-3 hover:border-primary/30">
                    <NairaIcon size={16} />
                    <p className="text-xs font-semibold">Pending bills</p>
                    <p className="text-lg font-bold">{pendingBills}</p>
                    <p className="text-[10px] text-muted-foreground">Needs follow-up</p>
                  </Link>
                )}
                {(lowStockCount > 0 || drugAlerts > 0) && (
                  <Link to="/inventory" className="rounded-xl border bg-card p-3 hover:border-primary/30">
                    <AlertTriangle size={16} className="mb-2 text-amber-600" />
                    <p className="text-xs font-semibold">Stock alerts</p>
                    <p className="text-lg font-bold">{lowStockCount + drugAlerts}</p>
                    <p className="text-[10px] text-muted-foreground">Review inventory</p>
                  </Link>
                )}
                <Link to="/appointments" className="rounded-xl border bg-card p-3 hover:border-primary/30">
                  <CalendarDays size={16} className="mb-2 text-primary" />
                  <p className="text-xs font-semibold">Schedule</p>
                  <p className="text-lg font-bold">{todayAppointments}</p>
                  <p className="text-[10px] text-muted-foreground">Today's appointments</p>
                </Link>
              </div>
            </div>
          )}

          <StaffRatingsSection
            staffFeedback={staffFeedback}
            loading={staffFeedbackLoading}
            error={staffFeedbackError}
            clinicName={effectiveClinicId ? "active clinic" : "clinic"}
            onRefresh={async () => {
              if (!effectiveClinicId) return;
              setStaffFeedbackLoading(true);
              const { data, error } = await apiClient.rpc("get_admin_staff_feedback_ratings", { p_clinic_id: effectiveClinicId });
              if (error) setStaffFeedbackError(error.message);
              else setStaffFeedback((data || []) as StaffFeedbackRow[]);
              setStaffFeedbackLoading(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function TodaySchedule({
  appointments,
  loading,
}: {
  appointments: any[];
  loading: boolean;
}) {
  const formatTime = (value?: string | null) => {
    if (!value) return "Time not set";
    const [hours, minutes] = value.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="medical-card mb-6 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-primary shrink-0" />
            <h2 className="section-title">Today's Schedule</h2>
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
              {appointments.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            {todayLabel} · {appointments.length === 1 ? "1 appointment" : `${appointments.length} appointments`}
          </p>
        </div>
        <Link
          to="/appointments"
          className="shrink-0 inline-flex items-center rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-[76px] rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <Link
          to="/appointments"
          className="flex items-center gap-3 rounded-2xl border border-dashed bg-muted/20 p-4 hover:bg-muted/40 transition-colors"
        >
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays size={19} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">No appointments scheduled today</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Open Appointments to add a patient to today's schedule.
            </p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        </Link>
      ) : (
        <div className="space-y-2">
          {appointments.map((a: any) => (
            <Link
              key={a.id}
              to="/appointments"
              className="flex items-center gap-3 rounded-2xl border bg-card p-3 hover:border-primary/30 hover:bg-primary/[0.03] transition-all group"
              title="Open appointments"
            >
              <div className="w-[62px] shrink-0 text-center">
                <p className="text-sm font-bold text-primary">
                  {formatTime(a.appointment_time)}
                </p>
                <div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                  <Clock size={10} />
                  Time
                </div>
              </div>

              <div className="w-px self-stretch bg-border/70" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">
                    {a.patient_name || "Unknown patient"}
                  </p>
                  {a.patient_number && (
                    <span className="shrink-0 text-[9px] font-mono rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {a.patient_number}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground truncate mt-1">
                  {a.reason || "Appointment"}
                </p>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-semibold text-green-700">
                    <CheckCircle2 size={10} />
                    {a.status === "confirmed" ? "Confirmed" : "Pending"}
                  </span>
                  {a.priority && a.priority !== "normal" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                      <CircleDot size={10} />
                      {String(a.priority).replace(/_/g, " ")}
                    </span>
                  )}
                  {a.doctor_name && (
                    <span className="text-[9px] text-muted-foreground truncate">
                      Dr: {a.doctor_name}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StaffRatingsSection({
  staffFeedback,
  loading,
  error,
  clinicName,
  onRefresh,
}: {
  staffFeedback: StaffFeedbackRow[];
  loading: boolean;
  error: string | null;
  clinicName: string;
  onRefresh: () => void;
}) {
  const doctorRatings = staffFeedback.filter(
    (item) => item.staff_role === "doctor"
  );

  const receptionistRatings = staffFeedback.filter(
    (item) => item.staff_role === "receptionist"
  );

  const ratings = staffFeedback
    .map((item) => Number(item.rating))
    .filter((rating) => Number.isFinite(rating));

  const averageRating =
    ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + rating, 0) /
        ratings.length
      : null;

  return (
    <div className="medical-card">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Star size={16} />
            Staff Ratings & Feedback
          </h2>

          <p className="text-xs text-muted-foreground mt-1">
            Patient feedback for {clinicName}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Loading staff ratings…
        </div>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-destructive">
            {error}
          </p>
        </div>
      ) : staffFeedback.length === 0 ? (
        <div className="py-8 text-center">
          <Star
            size={28}
            className="mx-auto text-muted-foreground mb-2"
          />

          <p className="text-sm font-medium">
            No staff ratings yet
          </p>

          <p className="text-xs text-muted-foreground mt-1">
            Patient staff ratings and comments will appear here
            when feedback is submitted.
          </p>
        </div>
      ) : (
        <>
          {/* Compact summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="rounded-xl border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total
              </p>
              <p className="text-lg font-semibold">
                {staffFeedback.length}
              </p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Doctors
              </p>
              <p className="text-lg font-semibold">
                {doctorRatings.length}
              </p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Front Desk
              </p>
              <p className="text-lg font-semibold">
                {receptionistRatings.length}
              </p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Average
              </p>

              <p className="text-lg font-semibold flex items-center gap-1">
                <Star
                  size={14}
                  className="text-amber-500 fill-current"
                />

                {averageRating !== null
                  ? averageRating.toFixed(1)
                  : "—"}
              </p>
            </div>
          </div>

          {/* Individual ratings */}
          <div className="space-y-3">
            {staffFeedback.map((feedback) => (
              <div
                key={feedback.feedback_id}
                className="rounded-xl border p-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted capitalize">
                        {feedback.staff_role === "doctor"
                          ? "Doctor"
                          : "Front Desk"}
                      </span>

                      <span className="text-sm font-semibold truncate">
                        {feedback.staff_name}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1">
                      Patient:{" "}
                      <span className="font-medium text-foreground">
                        {feedback.patient_name}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <Star
                        size={14}
                        className="text-amber-500 fill-current"
                      />
                      {feedback.rating}/5
                    </span>

                    <span className="text-[10px] text-muted-foreground">
                      {new Date(
                        feedback.submitted_at
                      ).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {(
                  feedback.positive_feedback ||
                  feedback.what_did_well
                ) && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                      Positive feedback
                    </p>

                    <p className="text-xs leading-relaxed">
                      {feedback.positive_feedback ||
                        feedback.what_did_well}
                    </p>
                  </div>
                )}

                {(
                  feedback.improvement_feedback ||
                  feedback.what_can_improve
                ) && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                      Improvement feedback
                    </p>

                    <p className="text-xs leading-relaxed">
                      {feedback.improvement_feedback ||
                        feedback.what_can_improve}
                    </p>
                  </div>
                )}

                {feedback.anything_else && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                      Additional comments
                    </p>

                    <p className="text-xs leading-relaxed">
                      {feedback.anything_else}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
