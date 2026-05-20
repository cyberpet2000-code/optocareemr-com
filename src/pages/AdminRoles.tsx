import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Mail, KeyRound, UserX, UserCheck, Send } from "lucide-react";
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
      .select("id, full_name, is_active")
      .in("id", ids);
    const roleMap = new Map<string, AppRole>();
    (roles || []).forEach((r: any) => { if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role); });
    const rows: StaffRow[] = (profiles || []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      is_active: p.is_active !== false,
      role: roleMap.get(p.id) || "doctor",
    }));
    rows.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    setStaff(rows);
    setLoading(false);
  }, [effectiveClinicId]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveClinicId) { toast.error("No active clinic"); return; }
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("create-clinic-invite", {
      body: {
        clinic_id: effectiveClinicId,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        full_name: inviteName.trim() || undefined,
      },
    });
    setInviting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to send invite");
      return;
    }
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteName(""); setInviteEmail(""); setInviteRole("doctor");
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

  if (!isAdmin) {
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
    </div>
  );
}
