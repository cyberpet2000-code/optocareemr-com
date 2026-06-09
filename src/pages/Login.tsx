import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { APP_URL } from "@/lib/app-url";
import OptoCareLogo from "@/components/OptoCareLogo";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await apiClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}/reset-password`,
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Password reset link sent! Check your email.");
      setMode("login");
      return;
    }

    if (mode === "signup") {
      const { error } = await apiClient.auth.signUp({
        email, password,
        options: { emailRedirectTo: APP_URL },
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Account created! Check your email to confirm.");
    } else {
      const { data, error } = await apiClient.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      if (data.user) {
        // Clear any stale active clinic on a fresh login
        try { localStorage.removeItem("active_clinic_id"); } catch {}
        // Honor pending invite token (set by /accept-invite when unauthenticated)
        let pendingInvite: string | null = null;
        try { pendingInvite = sessionStorage.getItem("pending_invite_token"); } catch {}
        if (pendingInvite) {
          navigate(`/accept-invite?token=${encodeURIComponent(pendingInvite)}`, { replace: true });
          return;
        }
        // Do NOT navigate manually here — AppRoutes will redirect /login → /
        // as soon as the auth listener hydrates the user into context. This
        // avoids a race where we land on "/" before isAuthReady flips true
        // and ProtectedRouteGate bounces us back to /login.
      }
    }
  };

  return (
    <div className="login-aurora flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md space-y-3 animate-page">
        
        <div className="flex justify-center mb-8">  
      <OptoCareLogo
  size="xl"
  showTagline={true}
  className="w-full"
  imgClassName="w-full max-w-[360px] md:max-w-[420px] h-auto mx-auto dark:drop-shadow-[0_2px_8px_rgba(255,255,255,0.25)]"
/>

        <div
  className="p-8 space-y-6 rounded-3xl border border-white/30"
  style={{
    background: "rgba(255,255,255,0.70)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    boxShadow:
      "0 20px 60px rgba(15,23,42,0.12), 0 8px 24px rgba(15,23,42,0.08)",
  }}
>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "forgot" ? "We'll email you a secure reset link" : mode === "signup" ? "Get started with OptoCare-EMR" : "Sign in to continue to your clinic"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <PasswordInput required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-12 bg-gradient-primary text-primary-foreground shadow-glow hover:scale-[1.02] hover:shadow-elevated transition-all duration-300"
              disabled={loading}
            >
              {loading ? "Please wait..." : mode === "forgot" ? "Send Reset Link" : mode === "signup" ? "Sign Up" : "Sign In"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground space-y-1 pt-1">
            {mode === "login" && (
              <>
                <p>
                  <button onClick={() => setMode("forgot")} className="text-primary hover:underline font-medium">Forgot password?</button>
                </p>
                <p>
                  Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="text-primary hover:underline font-medium">Sign up</button>
                </p>
              </>
            )}
            {mode === "signup" && (
              <p>Already have an account?{" "}
                <button onClick={() => setMode("login")} className="text-primary hover:underline font-medium">Sign in</button>
              </p>
            )}
            {mode === "forgot" && (
              <p>
                <button onClick={() => setMode("login")} className="text-primary hover:underline font-medium">Back to sign in</button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/80">
          Trusted by Eye Clinics • Secure • HIPAA-Aligned
        </p>
      </div>
    </div>
  );
}
