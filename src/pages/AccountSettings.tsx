import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useAccessClinic } from "@/hooks/useAccess";
import { disableOfflineAccess, enableOfflineAccess, hasOfflineAccess } from "@/lib/offlineAuth";
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
  const [offlineEnabled, setOfflineEnabled] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [offlinePin, setOfflinePin] = useState("");
  const [offlinePinConfirm, setOfflinePinConfirm] = useState("");
  const { profile, clinic, memberships, roles, role, effectiveClinicId, activeClinicId, resolvedClinicId } = useAccessClinic();

  useEffect(() => {
    if (user?.email) setEmail(user.email);
    setFullName(profile?.full_name || (user as any)?.user_metadata?.full_name || "");
    setPhone(profile?.phone || "");
    setAvatarUrl(profile?.avatar_url || "");
    void hasOfflineAccess().then(setOfflineEnabled);
  }, [user?.email, profile?.full_name, profile?.phone, profile?.avatar_url]);

  async function saveProfile() {
    if (!user) return;
    if (!fullName.trim()) return toast.error("Full name is required");
    setProfileSaving(true);
    try {
      const { error } = await apiClient
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated");
    } catch (error: any) {
      toast.error(error?.message || "Unable to update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function setupOfflineAccess() {
    if (!user) return;
    if (!/^\d{6}$/.test(offlinePin)) return toast.error("Offline PIN must be exactly 6 digits");
    if (offlinePin !== offlinePinConfirm) return toast.error("Offline PINs do not match");
    setSaving(true);
    try {
      await enableOfflineAccess(user, {
        profile,
        clinic,
        memberships,
        roles,
        role,
        resolvedClinicId,
        activeClinicId: activeClinicId || effectiveClinicId || null,
      }, offlinePin);
      setOfflineEnabled(true);
      setOfflinePin("");
      setOfflinePinConfirm("");
      toast.success("Offline access enabled on this device");
    } catch (error: any) {
      toast.error(error?.message || "Unable to enable offline access");
    } finally {
      setSaving(false);
    }
  }

  async function removeOfflineAccess() {
    setSaving(true);
    try {
      await disableOfflineAccess();
      setOfflineEnabled(false);
      toast.success("Offline access disabled on this device");
    } finally {
      setSaving(false);
    }
  }

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

      <div className="form-section space-y-4">
        <div>
          <div className="font-semibold">Profile</div>
          <p className="text-sm text-muted-foreground">Update the personal details shown on your OptoCare account.</p>
        </div>
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" className="w-14 h-14 rounded-full object-cover border border-border" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold">
              {(fullName || "U").split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase()}
            </div>
          )}
          <div className="text-xs text-muted-foreground">Profile photo can be provided with an image URL.</div>
        </div>
        <div className="space-y-2">
          <Label>Full name</Label>
          <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
        </div>
        <div className="space-y-2">
          <Label>Phone number</Label>
          <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234..." />
        </div>
        <div className="space-y-2">
          <Label>Profile photo URL</Label>
          <Input type="url" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Role</div>
            <div className="font-medium capitalize">{role || "—"}</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Current clinic</div>
            <div className="font-medium truncate">{clinic?.name || "—"}</div>
          </div>
        </div>
        <Button onClick={saveProfile} disabled={profileSaving}>
          {profileSaving ? "Saving..." : "Save profile"}
        </Button>
      </div>

      <div className="form-section space-y-3">
        <div className="font-semibold">Offline access</div>
        <p className="text-sm text-muted-foreground">
          Unlock OptoCare on this trusted device when there is no internet. Your Supabase password is never stored locally.
        </p>
        {offlineEnabled ? (
          <>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              Offline access is enabled on this device.
            </div>
            <Button variant="outline" onClick={removeOfflineAccess} disabled={saving}>Disable on this device</Button>
          </>
        ) : (
          <>
            <Label>6-digit offline PIN</Label>
            <Input inputMode="numeric" autoComplete="off" maxLength={6} type="password" value={offlinePin} onChange={e => setOfflinePin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <Label>Confirm offline PIN</Label>
            <Input inputMode="numeric" autoComplete="off" maxLength={6} type="password" value={offlinePinConfirm} onChange={e => setOfflinePinConfirm(e.target.value.replace(/\\D/g, "").slice(0, 6))} />
            <Button onClick={setupOfflineAccess} disabled={saving || offlinePin.length !== 6 || offlinePinConfirm.length !== 6}>
              {saving ? "Saving..." : "Enable offline access"}
            </Button>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Offline mode uses the clinic permissions and data already cached on this device. Reconnection returns to normal server authentication and sync.
        </p>
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
