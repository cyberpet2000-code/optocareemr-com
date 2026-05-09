import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, MailCheck, Loader2, AlertTriangle } from "lucide-react";

const PENDING_KEY = "pending_invite_token";

type InviteState =
  | { kind: "checking" }
  | { kind: "invalid"; reason: string; email?: string }
  | { kind: "valid"; clinic_name: string; email: string };

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, authLoading, switchClinic, reload } = useAccess();
  const [invite, setInvite] = useState<InviteState>({ kind: "checking" });
  const [working, setWorking] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const tokenFromUrl = params.get("token");

  useEffect(() => {
    if (tokenFromUrl) {
      try { sessionStorage.setItem(PENDING_KEY, tokenFromUrl); } catch {}
    }
  }, [tokenFromUrl]);

  const token = tokenFromUrl || (() => { try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; } })();

  // Pre-validate token on mount (no auth required)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setInvite({ kind: "invalid", reason: "missing_token" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("validate-invite", { body: { token } });
      if (cancelled) return;
      if (error || !data) {
        setInvite({ kind: "invalid", reason: "error" });
        return;
      }
      const d = data as any;
      if (d.valid) {
        setInvite({ kind: "valid", clinic_name: d.clinic_name, email: d.email });
      } else {
        setInvite({ kind: "invalid", reason: d.reason || "unknown", email: d.email });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    if (!token) return;
    setWorking(true);
    setErrMsg(null);
    const { data, error } = await supabase.functions.invoke("accept-clinic-invite", { body: { token } });
    if (error || (data as any)?.error) {
      setErrMsg((data as any)?.error || error?.message || "Failed to accept invite");
      setWorking(false);
      return;
    }
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    setDoneMsg(`You now have access to ${(data as any)?.clinic_name || "the clinic"}.`);
    await reload();
    try {
      await switchClinic((data as any).clinic_id);
      toast.success("Invite accepted");
      navigate((data as any).setup_completed ? "/dashboard" : "/onboarding", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Could not enter clinic automatically");
      navigate("/select-clinic", { replace: true });
    }
  };

  if (authLoading || invite.kind === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={16} /> Verifying invite…
      </div>
    );
  }

  if (invite.kind === "invalid") {
    const label =
      invite.reason === "already_used" ? "This invite has already been used."
      : invite.reason === "missing_token" ? "No invite token found in this link."
      : invite.reason === "not_found" ? "Invite expired or invalid."
      : "We couldn't verify this invite. It may have expired.";
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm form-section text-center space-y-3">
          <AlertTriangle className="mx-auto text-destructive" size={36} />
          <h1 className="text-lg font-bold">Invite unavailable</h1>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            Please ask your super admin to send you a new invite link.
          </p>
          <Button variant="outline" className="w-full" onClick={() => navigate("/login", { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  // Valid invite
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm form-section text-center space-y-3">
          <MailCheck className="mx-auto text-primary" size={36} />
          <h1 className="text-lg font-bold">Join {invite.clinic_name}</h1>
          <p className="text-sm text-muted-foreground">
            Sign in {invite.email ? <>as <span className="font-medium">{invite.email}</span></> : null} to accept this invite. We'll bring you back here right after.
          </p>
          <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>Sign in / Sign up</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm form-section text-center space-y-4">
        {doneMsg ? <CheckCircle2 className="mx-auto text-primary" size={40} /> : <MailCheck className="mx-auto text-primary" size={40} />}
        <h1 className="text-lg font-bold">Join {invite.clinic_name}</h1>
        <p className="text-sm text-muted-foreground">
          {doneMsg || `Accept this invite to join ${invite.clinic_name} as a clinic admin.`}
        </p>
        {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
        {!doneMsg && (
          <Button className="w-full" onClick={accept} disabled={working}>
            {working && <Loader2 size={14} className="animate-spin mr-2" />}
            {working ? "Accepting…" : "Accept invite"}
          </Button>
        )}
      </div>
    </div>
  );
}
