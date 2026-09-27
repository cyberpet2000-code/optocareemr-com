import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAccessClinic } from "@/hooks/useAccess";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, MapPin, MessageCircle, Save } from "lucide-react";

export default function ClinicSettings() {
  const { clinic, reload } = useAccessClinic();
  const { role } = useRole();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [tagline, setTagline] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clinic) return;
    setName(clinic.name || "");
    setAddress((clinic as any).address || "");
    setTagline((clinic as any).tagline || "");
    setWhatsapp((clinic as any).whatsapp_phone || "");
    setPhone((clinic as any).phone || "");
    setEmail((clinic as any).email || "");
    setWebsite((clinic as any).website || "");
  }, [clinic?.id, clinic?.name, (clinic as any)?.address, (clinic as any)?.tagline, (clinic as any)?.whatsapp_phone, (clinic as any)?.phone, (clinic as any)?.email, (clinic as any)?.website]);

  const save = async () => {
    if (!clinic) return;
    if (!name.trim()) return toast.error("Clinic name is required");
    if (whatsapp.trim() && whatsapp.replace(/\D/g, "").length > 15) return toast.error("Enter one WhatsApp number only.");
    setSaving(true);
    try {
      const { error } = await apiClient.rpc("update_clinic_public_settings", {
        _clinic_id: clinic.id, _name: name, _address: address, _tagline: tagline,
        _whatsapp_phone: whatsapp, _phone: phone, _email: email, _website: website,
      } as any);
      if (error) throw error;
      await reload();
      toast.success("Clinic settings saved");
    } catch (error: any) {
      toast.error(error?.message || "Unable to save clinic settings");
    } finally { setSaving(false); }
  };

  if (role !== "admin" && role !== "super_admin") {
    return <div className="form-section"><h1 className="text-xl font-semibold">Clinic Settings</h1><p className="text-sm text-muted-foreground mt-2">Only clinic administrators can edit clinic information.</p></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-bold">Clinic Settings</h1><p className="text-sm text-muted-foreground">Control the clinic identity and contact details shown across OptoCare, reports and patient communications.</p></div>
      <div className="form-section space-y-5">
        <div className="flex items-center gap-2 font-semibold"><Building2 size={18} /> Clinic identity</div>
        <div className="space-y-2"><Label>Clinic name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Your clinic name" /></div>
        <div className="space-y-2"><Label>Clinic tagline</Label><Input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Clear vision. Better care." maxLength={120} /><p className="text-xs text-muted-foreground">A short line that can appear beneath the clinic name on branded materials.</p></div>
        <div className="space-y-2"><Label>Clinic address</Label><Textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Full clinic address" rows={3} /><p className="text-xs text-muted-foreground">Use the public-facing clinic address, not a staff member's home address.</p></div>
      </div>
      <div className="form-section space-y-5">
        <div className="flex items-center gap-2 font-semibold"><MessageCircle size={18} /> Contact details</div>
        <div className="space-y-2"><Label>WhatsApp contact line</Label><Input type="tel" inputMode="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+234 801 234 5678" /><p className="text-xs text-muted-foreground">This is the WhatsApp number patients should use to contact the clinic. Enter one number only.</p></div>
        <div className="space-y-2"><Label>Clinic phone</Label><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234..." /></div>
        <div className="space-y-2"><Label>Clinic email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="clinic@example.com" /></div>
        <div className="space-y-2"><Label>Website</Label><Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." /></div>
      </div>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><div className="flex items-center gap-2 font-medium"><MapPin size={16} /> Public clinic identity</div><p className="text-muted-foreground mt-1">Address, tagline and WhatsApp contact can be reused by future reports, flyers, patient messages and other clinic-facing communications.</p></div>
      <Button onClick={save} disabled={saving} className="gap-2"><Save size={16} />{saving ? "Saving..." : "Save clinic settings"}</Button>
    </div>
  );
}
