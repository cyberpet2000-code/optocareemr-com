import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useClinic } from "@/hooks/useClinic";
import {
  Building2,
  Users,
  Activity,
  AlertOctagon,
  ShieldCheck,
  Plus,
  Star,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { diag } from "@/lib/diag";

type StaffFeedbackRow = {
  feedback_id: string;
  staff_id: string | null;
  staff_name: string;
  staff_role: "doctor" | "receptionist";
  rating: number;
  visit_id: string;
  patient_id: string;
  patient_name: string;
  submitted_at: string;
  positive_feedback: string | null;
  improvement_feedback: string | null;
  what_did_well: string | null;
  what_can_improve: string | null;
  anything_else: string | null;
};

export default function SuperAdminDashboard() {
  const { isAuthReady } = useAuth();
    const { effectiveClinicId } = useClinic();

  const [staffFeedback, setStaffFeedback] = useState<StaffFeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ clinics: number; patients: number; users: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const end = diag.time("perf", "super-admin-stats");
      try {
        const [c, p, u] = await Promise.all([
          apiClient.from("clinics").select("id", { count: "exact", head: true }),
          apiClient.from("patients").select("id", { count: "exact", head: true }),
          apiClient.from("profiles").select("id", { count: "exact", head: true }),
        ]);
        const errors: { table: string; error: { message: string } }[] = [
          { table: "clinics", error: c.error },
          { table: "patients", error: p.error },
          { table: "profiles", error: u.error },
        ].filter(e => e.error) as { table: string; error: { message: string } }[];

        if (errors.length > 0) {
          errors.forEach(e => {
            console.error(`[SuperAdminDashboard] ${e.table} query error:`, e.error.message);
            diag.error("query", `${e.table} stats failed`, e.error, { table: e.table });
          });
          const first = errors[0];
          if (!cancelled) setError(`${first.table} query failed: ${first.error.message}`);
          return;
        }
        console.log("SUPER ADMIN COUNTS", {
  clinics: c.count,
  patients: p.count,
  users: u.count,
  clinicsError: c.error,
});

if (!cancelled) {
  setStats({
    clinics: c.count ?? 0,
    patients: p.count ?? 0,
    users: u.count ?? 0,
  });
}
      } catch (err: any) {
        console.error("[SuperAdminDashboard] stats fetch failed:", err);
        diag.error("query", "super-admin-stats fetch failed", err);
        if (!cancelled) setError(err?.message || "Failed to load stats");
      } finally {
        end();
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthReady]);

    useEffect(() => {
    if (!isAuthReady || !effectiveClinicId) {
      setStaffFeedback([]);
      setFeedbackLoading(false);
      setFeedbackError(null);
      return;
    }

    let cancelled = false;

    const loadStaffFeedback = async () => {
      setFeedbackLoading(true);
      setFeedbackError(null);

      try {
        const { data, error } = await apiClient.rpc(
          "get_admin_staff_feedback_ratings",
          {
            p_clinic_id: effectiveClinicId,
          }
        );

        if (error) {
          console.error(
            "[SuperAdminDashboard] staff ratings error:",
            error
          );

          if (!cancelled) {
            setStaffFeedback([]);
            setFeedbackError(
              error.message || "Failed to load staff ratings"
            );
          }

          return;
        }

        if (!cancelled) {
          setStaffFeedback(
            (data || []) as StaffFeedbackRow[]
          );
        }
      } catch (err: any) {
        console.error(
          "[SuperAdminDashboard] staff ratings fetch failed:",
          err
        );

        if (!cancelled) {
          setStaffFeedback([]);
          setFeedbackError(
            err?.message || "Failed to load staff ratings"
          );
        }
      } finally {
        if (!cancelled) {
          setFeedbackLoading(false);
        }
      }
    };

    loadStaffFeedback();

    return () => {
      cancelled = true;
    };
  }, [effectiveClinicId, isAuthReady]);

    const totalRatings = staffFeedback.length;

  const doctorRatings = staffFeedback.filter(
    (item) => item.staff_role === "doctor"
  );

  const receptionistRatings = staffFeedback.filter(
    (item) => item.staff_role === "receptionist"
  );

  const averageRating =
    totalRatings > 0
      ? staffFeedback.reduce(
          (sum, item) => sum + Number(item.rating || 0),
          0
        ) / totalRatings
      : 0;

  const cards = [
    { label: "Total Clinics", value: stats?.clinics, icon: Building2 },
    { label: "Total Patients", value: stats?.patients, icon: Users },
    { label: "Platform Users", value: stats?.users, icon: ShieldCheck },
  ];

    const links = [
    { to: "/super-admin/clinics", label: "Clinics", icon: Building2, desc: "Manage clinic accounts and access" },
    { to: "/super-admin/users", label: "Users & Roles", icon: Users, desc: "Manage platform users and permissions" },
    { to: "/super-admin/system-health", label: "System Health", icon: Activity, desc: "Diagnostics, performance and service health" },
    { to: "/super-admin/emergency-response", label: "Emergency Response", icon: AlertOctagon, desc: "Diagnose incidents and run controlled recovery" },
    { to: "/super-admin/create-clinic", label: "Create Clinic", icon: Plus, desc: "Provision a new clinic and administrator" },
  ];

  const showSkeletons = !isAuthReady || loading || !stats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Super Admin Control Center</h1>
        <p className="text-sm text-muted-foreground">Global platform overview and management</p>
      </div>
      {error && (
        <div className="form-section text-sm text-destructive border-destructive/40">
          Failed to load stats: {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="form-section flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon size={22} /></div>
              <div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                {showSkeletons ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <div className="text-2xl font-bold">{c.value ?? "—"}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Platform Operations</h2>
          <p className="text-xs text-muted-foreground">Routine administration and monitoring</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map(l => {
          const Icon = l.icon;
          return (
            <Link key={l.to} to={l.to} className="form-section hover:border-primary/50 transition-all group">
              <Icon className="text-primary mb-2" size={22} />
              <div className="font-semibold group-hover:text-primary">{l.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
            </Link>
          );
        })}
      </div>
            {/* Active Clinic Staff Ratings */}
      <div className="form-section">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h2 className="section-title text-sm flex items-center gap-2">
              <Star size={14} />
              Staff Ratings & Feedback
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Staff feedback for the active clinic
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={async () => {
              if (!effectiveClinicId) return;

              setFeedbackLoading(true);
              setFeedbackError(null);

              try {
                const { data, error } = await apiClient.rpc(
                  "get_admin_staff_feedback_ratings",
                  {
                    p_clinic_id: effectiveClinicId,
                  }
                );

                if (error) {
                  setFeedbackError(error.message);
                  setStaffFeedback([]);
                } else {
                  setStaffFeedback(
                    (data || []) as StaffFeedbackRow[]
                  );
                }
              } finally {
                setFeedbackLoading(false);
              }
            }}
            disabled={feedbackLoading || !effectiveClinicId}
          >
            <RefreshCw
              size={12}
              className={feedbackLoading ? "animate-spin" : ""}
            />
            Refresh
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">
              Total ratings
            </p>
            <p className="text-lg font-semibold">
              {totalRatings}
            </p>
          </div>

          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">
              Doctors
            </p>
            <p className="text-lg font-semibold">
              {doctorRatings.length}
            </p>
          </div>

          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">
              Front Desk
            </p>
            <p className="text-lg font-semibold">
              {receptionistRatings.length}
            </p>
          </div>

          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">
              Average
            </p>
            <p className="text-lg font-semibold flex items-center gap-1">
              <Star
                size={14}
                className="text-amber-500 fill-current"
              />
              {totalRatings > 0
                ? averageRating.toFixed(1)
                : "—"}
            </p>
          </div>
        </div>

        {/* Loading */}
        {feedbackLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading staff ratings…
          </div>
        ) : feedbackError ? (
          <div className="py-6 text-center">
            <p className="text-sm text-destructive">
              {feedbackError}
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
              Patient feedback ratings for this clinic will appear
              here after feedback is submitted.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {staffFeedback.map((feedback) => {
              const submittedDate = new Date(
                feedback.submitted_at
              ).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={feedback.feedback_id}
                  className="medical-card p-3 sm:p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted">
                          {feedback.staff_role === "doctor"
                            ? "Doctor"
                            : "Front Desk"}
                        </span>

                        <p className="text-sm font-semibold truncate">
                          {feedback.staff_name}
                        </p>
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">
                        Patient:{" "}
                        <span className="text-foreground font-medium">
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

                      <span className="text-[11px] text-muted-foreground">
                        {submittedDate}
                      </span>
                    </div>
                  </div>

                  {(feedback.positive_feedback ||
                    feedback.what_did_well) && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                        What the patient liked
                      </p>
                      <p className="text-xs leading-relaxed">
                        {feedback.positive_feedback ||
                          feedback.what_did_well}
                      </p>
                    </div>
                  )}

                  {(feedback.improvement_feedback ||
                    feedback.what_can_improve) && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                        What could be improved
                      </p>
                      <p className="text-xs leading-relaxed">
                        {feedback.improvement_feedback ||
                          feedback.what_can_improve}
                      </p>
                    </div>
                  )}

                  {feedback.anything_else && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        <MessageSquare size={11} />
                        Additional comments
                      </p>
                      <p className="text-xs leading-relaxed">
                        {feedback.anything_else}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


