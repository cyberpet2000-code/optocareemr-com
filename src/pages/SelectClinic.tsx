import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAccess } from "@/hooks/useAccess";
import { Button } from "@/components/ui/button";
import { Building2, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function SelectClinic() {
  const navigate = useNavigate();
  const { memberships, switchClinic, signOut, role } = useAccess();
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const enter = async (m: any) => {
    if (enteringId) return;
    setEnteringId(m.clinic_id);
    try {
      await switchClinic(m.clinic_id);
      toast.success(`Entered ${m.clinic_name || "clinic"}`);
      navigate(m.setup_completed === false ? "/onboarding" : "/dashboard", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Failed to enter clinic");
    } finally {
      setEnteringId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Select a clinic</h1>
          <p className="text-sm text-muted-foreground">Choose which clinic to enter.</p>
        </div>
        <div className="form-section space-y-2">
          {memberships.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              You don't belong to any clinic yet. Contact your admin or super admin to be invited.
            </div>
          ) : memberships.map((m: any) => (
            <button
              key={m.clinic_id}
              onClick={() => enter(m)}
              disabled={!!enteringId}
              className="w-full flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 transition-colors text-left disabled:opacity-60"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Building2 size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{m.clinic_name || "Unnamed clinic"}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {m.role} · {m.setup_completed === false ? "Setup pending" : "Active"}
                </div>
              </div>
              <LogIn size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          {role === "super_admin" && (
            <Button variant="outline" onClick={() => navigate("/super-admin")}>Super Admin</Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}>
            <LogOut size={14} className="mr-1" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
