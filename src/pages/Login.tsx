import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Password reset link sent! Check your email.");
      setMode("login");
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin },
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Account created! Check your email to confirm.");
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      let dest = "/";
      if (data.user) {
        const { data: prof } = await supabase.from("profiles").select("role, is_super_admin").eq("id", data.user.id).maybeSingle();
        const { data: rolesData } = await supabase.from("user_roles").select("role, clinic_id").eq("user_id", data.user.id);
        const rows = (rolesData || []) as Array<{ role: string; clinic_id: string | null }>;
        const isSuper = (prof as any)?.is_super_admin === true || (prof as any)?.role === "super_admin" || rows.some(r => r.role === "super_admin");
        const clinicMemberships = Array.from(new Set(rows.map(r => r.clinic_id).filter(Boolean) as string[]));
        // Clear any stale active clinic on a fresh login
        try { localStorage.removeItem("active_clinic_id"); } catch {}
        // Honor pending invite token (set by /accept-invite when unauthenticated)
        let pendingInvite: string | null = null;
        try { pendingInvite = sessionStorage.getItem("pending_invite_token"); } catch {}
        if (pendingInvite) {
          dest = `/accept-invite?token=${encodeURIComponent(pendingInvite)}`;
        } else if (isSuper) {
          dest = "/super-admin";
        } else if (clinicMemberships.length === 0) {
          dest = "/select-clinic";
        } else {
          dest = "/select-clinic";
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
