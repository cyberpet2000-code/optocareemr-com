import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Building2, Plus, LogIn, UserPlus, Copy, Check, CheckCircle2, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAccess } from "@/hooks/useAccess";
import { toast } from "sonner";
import PendingInvitesPanel from "@/components/PendingInvitesPanel";

type Lifecycle = "active" | "suspended" | "deactivated";

function lifecycleLabel(c: any): { label: string; cls: string } {
  const s: Lifecycle = (c.lifecycle_status as Lifecycle) || "active";
  switch (s) {
    case "active": return { label: "Active", cls: "bg-success/10 text-success" };
    case "suspended": return { label: "Suspended", cls: "bg-warning/10 text-warning" };
    case "deactivated": return { label: "Deactivated", cls: "bg-destructive/10 text-destructive" };
    default: return { label: "Active", cls: "bg-success/10 text-success" };
  }
}

const ALLOWED_TRANSITIONS: Record<Lifecycle, Lifecycle[]> = {
  active: ["suspended", "deactivated"],
  suspended: ["active"],
  deactivated: [],
};

export default function SuperAdminClinics() {
  const [clinics, setClinics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const { switchClinic } = useAccess();
  const navigate = useNavigate();

  // Invite dialog state
  const [inviteFor, setInviteFor] = useState<{ id: string; name: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    const { data } = await apiClient.from("clinics")
      .select("id, name, subscription_status, setup_completed, is_active, lifecycle_status, deactivated_at, deactivation_reason, created_at")
      .order("created_at", { ascending: false });
    setClinics(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const [busyId, setBusyId] = useState<string | null>(null);
  const transitionLifecycle = async (c: any, next: Lifecycle) => {
    const current = (c.lifecycle_status as Lifecycle) || "active";
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      toast.error(`Cannot transition ${current} → ${next}`);
      return;
    }
    let reason: string | null = null;
    if (next === "suspended" || next === "deactivated") {
      reason = prompt(`Reason for ${next}?`) || "manual";
      if (!confirm(`${next === "deactivated" ? "Deactivate" : "Suspend"} ${c.name}?`)) return;
    }
    setBusyId(c.id);
    // eslint-disable-next-line no-console
    console.debug("[lifecycle]", { clinic_id: c.id, from: current, to: next, reason });
    const { error } = await apiClient.rpc("set_clinic_lifecycle" as any, {
      _clinic_id: c.id, _next: next, _reason: reason,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Clinic ${next}`);
    refresh();
  };


  const enter = async (c: any) => {
    if (enteringId) return;
    setEnteringId(c.id);
    try {
      const granted = await switchClinic(c.id);
      if (granted) toast.success(`Access granted — entered ${c.name}`);
      else toast.warning(`Entered ${c.name} (access flagged)`);
      navigate(c.setup_completed ? "/dashboard" : "/onboarding", { replace: true });
    } catch (e: any) {
      toast.error(`Access denied: ${e?.message || "unknown error"}`);
    } finally {
      setEnteringId(null);
    }
  };

  const openInvite = (c: any) => {
    setInviteFor({ id: c.id, name: c.name });
    setInviteEmail("");
    setInviteLink(null);
    setCopied(false);
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFor) return;
    setInviting(true);
    const { data, error } = await apiClient.functions.invoke("create-clinic-invite", {
      body: { clinic_id: inviteFor.id, email: inviteEmail.trim(), role: "admin" },
    });
    setInviting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to create invite");
      return;
    }
    const link = (data as any)?.link as string;
    setInviteLink(link);
    toast.success("Invite created. Share the link with the admin.");
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">All Clinics</h1>
          <p className="text-sm text-muted-foreground">{clinics.length} total</p>
        </div>
        <Link to="/super-admin/create-clinic">
          <Button><Plus size={16} className="mr-1" /> New Clinic</Button>
        </Link>
      </div>
      <div className="form-section overflow-x-auto">
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : clinics.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No clinics yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Setup</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {clinics.map(c => {
                const lc = lifecycleLabel(c);
                return (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-medium flex items-center gap-2"><Building2 size={14} className="text-muted-foreground" /> {c.name}</td>
                  <td className="py-2.5 pr-3"><span className={`text-xs px-2 py-0.5 rounded-md ${lc.cls}`}>{lc.label}</span></td>
                  <td className="py-2.5 pr-3 text-xs">{c.setup_completed ? "✓ Done" : "Pending"}</td>
                  <td className="py-2.5 pr-3 text-xs">{c.is_active ? "Yes" : "No"}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <div className="inline-flex flex-wrap gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openInvite(c)}>
                        <UserPlus size={14} className="mr-1" /> Invite
                      </Button>
                      {(() => {
                        const cur = (c.lifecycle_status as Lifecycle) || "trial";
                        const allowed = ALLOWED_TRANSITIONS[cur];
                        const btn = (next: Lifecycle, label: string, Icon: any, variant: any = "outline") => (
                          <Button key={next} size="sm" variant={variant}
                            onClick={() => transitionLifecycle(c, next)}
                            disabled={busyId === c.id || !allowed.includes(next)}>
                            <Icon size={14} className="mr-1" /> {busyId === c.id ? "…" : label}
                          </Button>
                        );
                        return (
                          <>
                            {allowed.includes("active") && btn("active", cur === "suspended" ? "Reactivate" : "Activate", cur === "suspended" ? PlayCircle : CheckCircle2, "default")}
                            {allowed.includes("suspended") && btn("suspended", "Suspend", PauseCircle, "outline")}
                            {allowed.includes("deactivated") && btn("deactivated", "Deactivate", XCircle, "destructive")}
                          </>
                        );
                      })()}
                      <Button size="sm" variant="outline" onClick={() => enter(c)} disabled={enteringId === c.id || !!enteringId}>
                        <LogIn size={14} className="mr-1" /> {enteringId === c.id ? "Entering…" : "Enter"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>

      <PendingInvitesPanel />

      <Dialog open={!!inviteFor} onOpenChange={(o) => !o && setInviteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite clinic admin</DialogTitle>
          </DialogHeader>
          {inviteFor && (
            <form onSubmit={sendInvite} className="space-y-3">
              <div className="text-xs text-muted-foreground">Clinic: <span className="font-medium text-foreground">{inviteFor.name}</span></div>
              <div className="space-y-1.5">
                <Label>Admin email</Label>
                <Input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={!!inviteLink}
                  placeholder="admin@clinic.com"
                />
              </div>

              {inviteLink ? (
                <div className="space-y-2">
                  <Label>Share this link</Label>
                  <div className="flex items-stretch gap-2">
                    <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
                    <Button type="button" variant="outline" onClick={copyLink}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The recipient will sign in (or sign up) with this email and will be granted clinic admin access.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  We'll generate a single-use link. Share it with the admin — they'll sign in with this email to accept.
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setInviteFor(null)}>
                  {inviteLink ? "Done" : "Cancel"}
                </Button>
                {!inviteLink && (
                  <Button type="submit" disabled={inviting}>
                    {inviting ? "Creating…" : "Create invite"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
