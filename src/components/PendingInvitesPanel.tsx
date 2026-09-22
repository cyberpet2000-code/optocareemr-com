import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, X, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { confirmDestructiveAction } from "@/lib/safeDelete";

type Invite = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
  token: string | null;
  clinic_id: string | null;
  created_at: string | null;
  expires_at: string | null;
};

type ClinicMap = Record<string, string>;

export default function PendingInvitesPanel() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [clinics, setClinics] = useState<ClinicMap>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data } = await apiClient
      .from("clinic_invites")
      .select("id, email, role, status, token, clinic_id, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data || []) as Invite[];
    setInvites(rows);
    const ids = Array.from(new Set(rows.map((r) => r.clinic_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: cs } = await apiClient.from("clinics").select("id, name").in("id", ids);
      const map: ClinicMap = {};
      (cs || []).forEach((c: any) => (map[c.id] = c.name));
      setClinics(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const statusBadge = (inv: Invite) => {
    const expired = inv.expires_at ? new Date(inv.expires_at).getTime() < Date.now() : false;
    if (inv.status === "accepted")
      return { label: "Accepted", cls: "bg-success/10 text-success", Icon: CheckCircle2 };
    if (inv.status === "expired" || expired)
      return { label: "Expired", cls: "bg-destructive/10 text-destructive", Icon: AlertTriangle };
    return { label: "Pending", cls: "bg-primary/10 text-primary", Icon: Clock };
  };

  const resend = async (inv: Invite) => {
    if (!inv.clinic_id || !inv.email) return;
    setBusyId(inv.id);
    // Issue a fresh invite (new token + fresh 48h window)
    const { data, error } = await apiClient.functions.invoke("create-clinic-invite", {
      body: { clinic_id: inv.clinic_id, email: inv.email, role: inv.role || "admin" },
    });
    setBusyId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to resend invite");
      return;
    }
    // Mark the old one cancelled so we don't keep stale rows around
    await apiClient.from("clinic_invites").update({ status: "expired" } as any).eq("id", inv.id);
    toast.success(`Invite resent to ${inv.email}`);
    refresh();
  };

  const cancel = async (inv: Invite) => {
    if (!(await confirmDestructiveAction({ item: `pending invite for ${inv.email}` }))) return;
    setBusyId(inv.id);
    const { error } = await apiClient.from("clinic_invites").delete().eq("id", inv.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invite cancelled");
    refresh();
  };

  return (
    <div className="form-section">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Mail size={16} /> Clinic Invites</h2>
          <p className="text-xs text-muted-foreground">Resend or cancel pending invitations.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={refresh}>
          <RefreshCw size={14} className="mr-1" /> Refresh
        </Button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Loading invites…</div>
      ) : invites.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No invites yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Clinic</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Expires</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const s = statusBadge(inv);
                const canAct = s.label === "Pending" || s.label === "Expired";
                return (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{inv.email}</td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {inv.clinic_id ? clinics[inv.clinic_id] || "—" : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-xs capitalize">{inv.role || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${s.cls}`}>
                        <s.Icon size={12} /> {s.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {inv.expires_at ? new Date(inv.expires_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <div className="inline-flex gap-2 justify-end">
                        {canAct && (
                          <Button size="sm" variant="outline" onClick={() => resend(inv)} disabled={busyId === inv.id}>
                            <RefreshCw size={14} className="mr-1" /> Resend
                          </Button>
                        )}
                        {s.label !== "Accepted" && (
                          <Button size="sm" variant="ghost" onClick={() => cancel(inv)} disabled={busyId === inv.id}>
                            <X size={14} className="mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
