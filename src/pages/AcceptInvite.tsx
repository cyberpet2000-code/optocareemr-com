import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, MailCheck, Loader2, AlertTriangle } from "lucide-react";
import { APP_URL } from "@/lib/app-url";

const PENDING_KEY = "pending_invite_token";

type InviteState =
  | { kind: "checking" }
  | { kind: "invalid"; reason: string; email?: string }
  | { kind: "valid"; clinic_id: string; clinic_name: string; email: string };

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, authLoading, switchClinic, reload } = useAccess();
  const [invite, setInvite] = useState<InviteState>({ kind: "checking" });
  const [working, setWorking] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Sign-up form state
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [signinPassword, setSigninPassword] = useState("");
  const [emailSentMsg, setEmailSentMsg] = useState<string | null>(null);

  const tokenFromUrl = params.get("token");

  useEffect(() => {
    if (tokenFromUrl) {
      try { sessionStorage.setItem(PENDING_KEY, tokenFromUrl); } catch {}
    }
  }, [tokenFromUrl]);

  const token = useMemo(
    () => tokenFromUrl || (() => { try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; } })(),
    [tokenFromUrl],
  );

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
        setInvite({ kind: "valid", clinic_id: d.clinic_id, clinic_name: d.clinic_name, email: d.email });
      } else {
        setInvite({ kind: "invalid", reason: d.reason || "unknown", email: d.email });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Once authenticated AND we have a valid invite, finalize automatically.
  useEffect(() => {
    if (!user || invite.kind !== "valid" || working) return;
    void finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, invite.kind]);

  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
    ]);

  const finalize = async () => {
    if (!token || invite.kind !== "valid") return;
    setWorking(true);
    setErrMsg(null);
    try {
      console.log("[invite] finalize start", { user_id: user?.id, token: token.slice(0, 8) });

      // Ensure session is present before invoking edge function
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error("Your session expired. Please sign in again.");
      }
      console.log("[invite] session ok");

      const { data, error } = await withTimeout(
        supabase.functions.invoke("accept-clinic-invite", { body: { token } }),
        15000,
        "Accept invite",
      );
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Failed to accept invite");
      }
      console.log("[invite] accepted", data);

      const targetClinicId = (data as any).clinic_id;
      const clinicName = (data as any).clinic_name;
      const setupCompleted = !!(data as any).setup_completed;

      try { sessionStorage.removeItem(PENDING_KEY); } catch {}

      // Reload access context (profile + memberships). Don't block forever.
      try {
        await withTimeout(reload(), 8000, "Reload access");
        console.log("[invite] access reloaded");
      } catch (e) {
        console.warn("[invite] reload timed out, continuing", e);
      }

      // Switch active clinic — fall back to /select-clinic if it fails
      try {
        await withTimeout(switchClinic(targetClinicId), 8000, "Switch clinic");
        console.log("[invite] clinic switched", targetClinicId);
        toast.success(`Welcome to ${clinicName}`);
        navigate(setupCompleted ? "/dashboard" : "/onboarding", { replace: true });
      } catch (e: any) {
        console.warn("[invite] switchClinic failed, going to select-clinic", e);
        toast.error(e?.message || "Could not enter clinic automatically");
        navigate("/select-clinic", { replace: true });
      }
    } catch (e: any) {
      console.error("[invite] finalize failed", e);
      setErrMsg(e?.message || "Failed to accept invite");
    } finally {
      setWorking(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invite.kind !== "valid") return;
    setErrMsg(null);
    if (!fullName.trim()) { setErrMsg("Please enter your full name"); return; }
    if (password.length < 6) { setErrMsg("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setErrMsg("Passwords do not match"); return; }

    setWorking(true);
    const redirect = `${APP_URL}/accept-invite?token=${encodeURIComponent(token!)}`;
    const { data, error } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: redirect },
    });

    if (error) {
      // If account already exists, switch to sign-in mode
      if (/already registered|already exists/i.test(error.message)) {
        setMode("signin");
        setSigninPassword(password);
        setErrMsg("You already have an account. Please sign in to accept the invite.");
      } else {
        setErrMsg(error.message);
      }
      setWorking(false);
      return;
    }

    if (data.session) {
      // Auto-logged in — finalize() will run via the user effect
      return;
    }
    // Email confirmation required
    setEmailSentMsg(`Check your email (${invite.email}) and click the confirmation link to finish joining ${invite.clinic_name}.`);
    setWorking(false);
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invite.kind !== "valid") return;
    setErrMsg(null);
    setWorking(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: invite.email,
      password: signinPassword,
    });
    if (error) {
      setErrMsg(error.message);
      setWorking(false);
      return;
    }
    // finalize() will run via user effect
  };

  // ---- RENDER ----

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

  // Email confirmation step
  if (emailSentMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm form-section text-center space-y-3">
          <MailCheck className="mx-auto text-primary" size={40} />
          <h1 className="text-lg font-bold">Confirm your email</h1>
          <p className="text-sm text-muted-foreground">{emailSentMsg}</p>
        </div>
      </div>
    );
  }

  // User is authenticated → finalizing
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm form-section text-center space-y-3">
          {errMsg ? (
            <>
              <AlertTriangle className="mx-auto text-destructive" size={36} />
              <h1 className="text-lg font-bold">Couldn't accept invite</h1>
              <p className="text-sm text-destructive">{errMsg}</p>
              <Button className="w-full" onClick={finalize} disabled={working}>
                {working && <Loader2 size={14} className="animate-spin mr-2" />} Try again
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto animate-spin text-primary" size={32} />
              <h1 className="text-lg font-bold">Joining {invite.clinic_name}…</h1>
              <p className="text-sm text-muted-foreground">Setting up your access</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Not authenticated → sign-up (default) or sign-in
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm form-section space-y-4">
        <div className="text-center space-y-1">
          <CheckCircle2 className="mx-auto text-primary" size={36} />
          <h1 className="text-lg font-bold">Join {invite.clinic_name}</h1>
          <p className="text-xs text-muted-foreground">
            {mode === "signup"
              ? "Create your account to accept this invite."
              : "Sign in with your existing account to accept this invite."}
          </p>
        </div>

        {mode === "signup" ? (
          <form onSubmit={handleSignup} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={invite.email} disabled />
            </div>
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Jane Doe" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
            <Button type="submit" className="w-full" disabled={working}>
              {working && <Loader2 size={14} className="animate-spin mr-2" />}
              {working ? "Creating account…" : "Create account & join"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <button type="button" className="text-primary hover:underline" onClick={() => { setMode("signin"); setErrMsg(null); }}>
                Sign in instead
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSignin} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={invite.email} disabled />
            </div>
            <div>
              <Label htmlFor="signinPassword">Password</Label>
              <Input id="signinPassword" type="password" value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} required />
            </div>
            {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
            <Button type="submit" className="w-full" disabled={working}>
              {working && <Loader2 size={14} className="animate-spin mr-2" />}
              {working ? "Signing in…" : "Sign in & join"}
            </Button>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button type="button" className="text-primary hover:underline" onClick={() => { setMode("signup"); setErrMsg(null); }}>
                Need to create an account?
              </button>
              <Link to="/reset-password" className="hover:underline">Forgot password?</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
