import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Mail, KeyRound, UserX, UserCheck, Send,Star, RefreshCw, MessageSquare } from "lucide-react";
import { useRole, type AppRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { useClinic } from "@/hooks/useClinic";
import { APP_URL } from "@/lib/app-url";
import PendingInvitesPanel from "@/components/PendingInvitesPanel";

const INVITE_ROLES: AppRole[] = ["admin", "doctor", "nurse", "receptionist"];

type StaffRow = {
  id: string;
  full_name: string | null;
  is_active: boolean;
  role: AppRole;
  phone: string | null;
  home_address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
};

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

async function logActivity(params: { user_id?: string; clinic_id: string | null; action: string; record_id?: string }) {
  if (!params.clinic_id || !params.user_id) return;
  await apiClient.from("activity_logs").insert({
    user_id: params.user_id,
    clinic_id: params.clinic_id,
    action: params.action,
    table_name: "profiles",
    record_id: params.record_id ?? null,
  } as never);
}

export default function AdminRoles({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin, isSuperAdmin } = useRole();
  const { user } = useAuth();
  const { effectiveClinicId } = useClinic();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [staffFeedback, setStaffFeedback] = useState<StaffFeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Invite form
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("doctor");
  const [inviting, setInviting] = useState(false);

  const loadStaff = useCallback(async () => {
    if (!effectiveClinicId) { setStaff([]); setLoading(false); return; }
    setLoading(true);
    const { data: roles } = await apiClient
      .from("user_roles")
      .select("user_id, role")
      .eq("clinic_id", effectiveClinicId);
    const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id).filter(Boolean)));
    if (ids.length === 0) { setStaff([]); setLoading(false); return; }
    const { data: profiles } = await apiClient
      .from("profiles")
       .select("id, full_name, is_active, phone, home_address, next_of_kin_name, next_of_kin_phone")
      .in("id", ids);
    const roleMap = new Map<string, AppRole>();
    (roles || []).forEach((r: any) => { if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role); });
    const rows: StaffRow[] = (profiles || []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      is_active: p.is_active !== false,
      role: roleMap.get(p.id) || "doctor",
      phone: p.phone || null,
      home_address: p.home_address || null,
      next_of_kin_name: p.next_of_kin_name || null,
      next_of_kin_phone: p.next_of_kin_phone || null,
    }));
    rows.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    setStaff(rows);
    setLoading(false);
  }, [effectiveClinicId]);

  const loadStaffFeedback = useCallback(async () => {
  if (!effectiveClinicId) {
    setStaffFeedback([]);
    setFeedbackLoading(false);
    return;
  }

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
      console.error("Failed to load staff feedback:", error);
      setFeedbackError(error.message || "Failed to load staff ratings");
      setStaffFeedback([]);
      return;
    }

    setStaffFeedback((data || []) as StaffFeedbackRow[]);
  } catch (err: any) {
    console.error("Failed to load staff feedback:", err);
    setFeedbackError(err?.message || "Failed to load staff ratings");
    setStaffFeedback([]);
  } finally {
    setFeedbackLoading(false);
  }
}, [effectiveClinicId]);

  useEffect(() => {
  loadStaff();
  loadStaffFeedback();
}, [loadStaff, loadStaffFeedback]);

  const totalRatings = staffFeedback.length;

const doctorRatings = staffFeedback.filter(
  (item) => item.staff_role === "doctor"
);

const receptionistRatings = staffFeedback.filter(
  (item) => item.staff_role === "receptionist"
);

const averageRating =
  totalRatings > 0
    ? staffFeedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
      totalRatings
    : 0;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveClinicId) { toast.error("No active clinic"); return; }
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    setInviting(true);
    try {
      const { data, error } = await apiClient.functions.invoke("create-clinic-invite", {
        body: {
          clinic_id: effectiveClinicId,
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          full_name: inviteName.trim() || undefined,
        },
      });
      if (error) {
        const msg = (data as any)?.message || error.message || "Failed to send invite";
        toast.error(msg);
        return;
      }
      if (!data?.ok) {
        toast.error(data?.message || "Failed to send invite");
        return;
      }
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteName(""); setInviteEmail(""); setInviteRole("doctor");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (row: StaffRow, nextRole: AppRole) => {
    if (!effectiveClinicId || nextRole === row.role) return;
    setBusyId(row.id);
    const { error: delErr } = await apiClient
      .from("user_roles").delete()
      .eq("user_id", row.id).eq("clinic_id", effectiveClinicId);
    if (delErr) { toast.error(delErr.message); setBusyId(null); return; }
    const { error: insErr } = await apiClient
      .from("user_roles").insert({ user_id: row.id, clinic_id: effectiveClinicId, role: nextRole } as never);
    if (insErr) { toast.error(insErr.message); setBusyId(null); return; }
    await logActivity({ user_id: user?.id, clinic_id: effectiveClinicId, action: "role_changed", record_id: row.id });
    toast.success("Role updated");
    setBusyId(null);
    loadStaff();
  };

  const toggleActive = async (row: StaffRow) => {
    setBusyId(row.id);
    const nextActive = !row.is_active;
    const { error } = await apiClient
      .from("profiles").update({ is_active: nextActive } as never).eq("id", row.id);
    if (error) { toast.error(error.message); setBusyId(null); return; }
    await logActivity({
      user_id: user?.id,
      clinic_id: effectiveClinicId,
      action: nextActive ? "user_reactivated" : "user_deactivated",
      record_id: row.id,
    });
    toast.success(nextActive ? "Staff reactivated" : "Staff deactivated");
    setBusyId(null);
    loadStaff();
  };

  const sendPasswordReset = async (row: StaffRow) => {
    // Look up email from auth via edge or fall back to profile (profile has no email). Use admin invite list.
    // Simpler: use Supabase auth resetPasswordForEmail with the user's email — but we don't have it client-side.
    // Workaround: ask the user to enter their email and use the existing reset flow.
    const email = window.prompt(`Enter email for ${row.full_name || "this user"} to send reset link:`);
    if (!email) return;
    setBusyId(row.id);
    const { error } = await apiClient.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${APP_URL}/reset-password`,
    });
    if (error) { toast.error(error.message); setBusyId(null); return; }
    await logActivity({ user_id: user?.id, clinic_id: effectiveClinicId, action: "password_reset_sent", record_id: row.id });
    toast.success("Password reset email sent");
    setBusyId(null);
  };

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="text-center py-12">
        <ShieldCheck size={48} className="mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Admin access only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="page-header flex items-center gap-2"><ShieldCheck size={20} /> Staff Management</h1>

      {/* Invite */}
      <form onSubmit={handleInvite} className="form-section space-y-3">
        <div>
          <h2 className="section-title text-sm">Invite Staff</h2>
          <p className="text-xs text-muted-foreground">They'll receive an email to set up their account.</p>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="sm:col-span-1 space-y-1">
            <Label className="text-xs">Full name</Label>
            <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jane@clinic.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={inviteRole} onValueChange={v => setInviteRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map(r => (
                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={inviting} className="gap-2">
          <Send size={14} /> {inviting ? "Sending…" : "Send invite"}
        </Button>
      </form>

      {/* Pending invites (super admins only — sees all; clinic admins see clinic's) */}
      {!embedded && <PendingInvitesPanel />}

      {/* Staff list */}
      <div className="form-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title text-sm flex items-center gap-2"><Mail size={14} /> Staff</h2>
          <span className="text-xs text-muted-foreground">{staff.length} member{staff.length === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading staff…</div>
        ) : staff.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No staff yet. Invite someone above.</div>
        ) : (
          <div className="space-y-2">
            {staff.map(row => (
              <div key={row.id} className="medical-card p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{row.full_name || "Unnamed"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.is_active ? (
                      <span className="text-success">Active</span>
                    ) : (
                      <span className="text-destructive">Deactivated</span>
                    )}
                  </p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Phone: <strong className="text-foreground font-medium">{row.phone || "—"}</strong></span>
                    <span>Home: <strong className="text-foreground font-medium">{row.home_address || "—"}</strong></span>
                    <span>Next of kin: <strong className="text-foreground font-medium">{row.next_of_kin_name || "—"}</strong></span>
                    <span>Emergency: <strong className="text-foreground font-medium">{row.next_of_kin_phone || "—"}</strong></span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={row.role}
                    onValueChange={(v) => changeRole(row, v as AppRole)}
                    disabled={busyId === row.id || row.id === user?.id}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLES.map(r => (
                        <SelectItem key={r} value={r} className="capitalize text-xs">{r}</SelectItem>
                      ))}
                      {(isSuperAdmin || row.role === "super_admin") && (
                        <SelectItem value="super_admin" className="text-xs">super_admin</SelectItem>
                      )}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm" variant="outline" className="h-8 gap-1"
                    onClick={() => sendPasswordReset(row)}
                    disabled={busyId === row.id}
                  >
                    <KeyRound size={12} /> Reset
                  </Button>

                  <Button
                    size="sm"
                    variant={row.is_active ? "outline" : "default"}
                    className="h-8 gap-1"
                    onClick={() => toggleActive(row)}
                    disabled={busyId === row.id || row.id === user?.id}
                  >
                    {row.is_active ? <><UserX size={12} /> Deactivate</> : <><UserCheck size={12} /> Reactivate</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
            {/* Staff Ratings & Feedback */}
      <div className="form-section">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h2 className="section-title text-sm flex items-center gap-2">
              <Star size={14} />
              Staff Ratings & Feedback
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Patient feedback for doctors and front-desk staff
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={loadStaffFeedback}
            disabled={feedbackLoading}
          >
            <RefreshCw
              size={12}
              className={feedbackLoading ? "animate-spin" : ""}
            />
            Refresh
          </Button>
        </div>

        {/* Rating summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">Total ratings</p>
            <p className="text-lg font-semibold">{totalRatings}</p>
          </div>

          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">Doctors</p>
            <p className="text-lg font-semibold">{doctorRatings.length}</p>
          </div>

          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">Front Desk</p>
            <p className="text-lg font-semibold">
              {receptionistRatings.length}
            </p>
          </div>

          <div className="medical-card p-3">
            <p className="text-[11px] text-muted-foreground">Average</p>
            <p className="text-lg font-semibold flex items-center gap-1">
              <Star size={14} className="text-amber-500 fill-current" />
              {totalRatings > 0 ? averageRating.toFixed(1) : "—"}
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
            <p className="text-sm text-destructive">{feedbackError}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={loadStaffFeedback}
            >
              Try again
            </Button>
          </div>
        ) : staffFeedback.length === 0 ? (
          <div className="py-8 text-center">
            <Star
              size={28}
              className="mx-auto text-muted-foreground mb-2"
            />
            <p className="text-sm font-medium">No staff ratings yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Patient feedback ratings will appear here after feedback is
              submitted.
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
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted capitalize">
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
