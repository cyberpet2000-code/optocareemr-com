import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AccountSettings() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pw1, setPw1] = useState(""); const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);

  async function changeEmail() {
    if (!newEmail || newEmail === email) return toast.error("Enter a new email");
    setSaving(true);
    const { error } = await apiClient.auth.updateUser({ email: newEmail });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Confirmation email sent to " + newEmail);
    setNewEmail("");
  }

  async function changePassword() {
    if (pw1.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw1 !== pw2) return toast.error("Passwords don't match");
    setSaving(true);
    const { error } = await apiClient.auth.updateUser({ password: pw1 });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setPw1(""); setPw2("");
  }

  async function sendReset() {
    if (!email) return;
    const { error } = await apiClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent");
  }

  const lastSignIn = (user as any)?.last_sign_in_at ? new Date((user as any).last_sign_in_at).toLocaleString() : "—";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your email, password and security</p>
      </div>

      <div className="form-section space-y-2">
        <div className="text-xs text-muted-foreground">Current email</div>
        <div className="text-base font-medium">{email || "—"}</div>
        <div className="text-xs text-muted-foreground mt-2">Last login: {lastSignIn}</div>
      </div>

      <div className="form-section space-y-3">
        <div className="font-semibold">Change email</div>
        <Label>New email</Label>
        <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@example.com" />
        <Button onClick={changeEmail} disabled={saving}>Update email</Button>
      </div>

      <div className="form-section space-y-3">
        <div className="font-semibold">Change password</div>
        <Label>New password</Label>
        <Input type="password" value={pw1} onChange={e => setPw1(e.target.value)} />
        <Label>Confirm password</Label>
        <Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={changePassword} disabled={saving}>Update password</Button>
          <Button variant="outline" onClick={sendReset}>Send reset email</Button>
        </div>
      </div>
    </div>
  );
}
