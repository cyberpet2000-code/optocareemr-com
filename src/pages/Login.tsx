import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { APP_URL } from "@/lib/app-url";

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
      let dest = "/";
      if (data.user) {
        // Clear any stale active clinic on a fresh login
        try { localStorage.removeItem("active_clinic_id"); } catch {}
        // Honor pending invite token (set by /accept-invite when unauthenticated)
        let pendingInvite: string | null = null;
        try { pendingInvite = sessionStorage.getItem("pending_invite_token"); } catch {}
        if (pendingInvite) {
          dest = `/accept-invite?token=${encodeURIComponent(pendingInvite)}`;
        } else {
          dest = "/";
        }
      }
      navigate(dest, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="bg-primary text-primary-foreground rounded-lg w-10 h-10 flex items-center justify-center text-lg font-black">O</span>
            <span className="text-2xl font-bold text-foreground">Optocare EMR</span>
          </div>
          <p className="text-muted-foreground text-sm">
            {mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form-section space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : mode === "forgot" ? "Send Reset Link" : mode === "signup" ? "Sign Up" : "Sign In"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground space-y-1">
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
    </div>
  );
}
