import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, MailCheck, Loader2 } from "lucide-react";

const PENDING_KEY = "pending_invite_token";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, authLoading, switchClinic, reload } = useAccess();
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const tokenFromUrl = params.get("token");

  useEffect(() => {
    if (tokenFromUrl) {
      try { sessionStorage.setItem(PENDING_KEY, tokenFromUrl); } catch {}
    }
  }, [tokenFromUrl]);

  const token = tokenFromUrl || (() => { try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; } })();

  const accept = async () => {
    if (!token) { setStatus("error"); setMessage("Missing invite token."); return; }
    setStatus("working");
    const { data, error } = await supabase.functions.invoke("accept-clinic-invite", { body: { token } });
    if (error || (data as any)?.error) {
      setStatus("error");
      setMessage((data as any)?.error || error?.message || "Failed to accept invite");
      return;
    }
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    setStatus("done");
    setMessage(`You now have access to ${(data as any)?.clinic_name || "the clinic"}.`);
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

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm form-section text-center space-y-3">
          <MailCheck className="mx-auto text-primary" size={36} />
          <h1 className="text-lg font-bold">Sign in to accept invite</h1>
          <p className="text-sm text-muted-foreground">You need an account to join the clinic. We'll bring you back here after signing in.</p>
          <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>Sign in / Sign up</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm form-section text-center space-y-4">
        {status === "done" ? <CheckCircle2 className="mx-auto text-primary" size={40} /> : <MailCheck className="mx-auto text-primary" size={40} />}
        <h1 className="text-lg font-bold">Clinic invitation</h1>
        <p className="text-sm text-muted-foreground">
          {status === "done" ? message : "Click below to accept and join the clinic as an admin."}
        </p>
        {status === "error" && <p className="text-sm text-destructive">{message}</p>}
        {status !== "done" && (
          <Button className="w-full" onClick={accept} disabled={status === "working" || !token}>
            {status === "working" && <Loader2 size={14} className="animate-spin mr-2" />}
            {status === "working" ? "Accepting…" : "Accept invite"}
          </Button>
        )}
      </div>
    </div>
  );
}
