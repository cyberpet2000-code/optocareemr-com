import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAccess } from "@/hooks/useAccess";
import { useAuth } from "@/hooks/useAuth";
import { ShieldCheck, ShieldAlert, ShieldX, Globe, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

type HmoRow = {
  id: string;
  name: string;
  website: string | null;
  claims_portal_url: string | null;
  phone: string | null;
  email: string | null;
};

type VerificationStatus = "not_verified" | "verified" | "rejected";

function normalizeUrl(u?: string | null) {
  if (!u) return "";
  const s = u.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export default function PatientRegister() {
  const navigate = useNavigate();
  const { effectiveClinicId: cid } = useAccess();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hmos, setHmos] = useState<HmoRow[]>([]);
  const [form, setForm] = useState({
    fullName: "", dateOfBirth: "", age: "", ageUnit: "years", gender: "", phone: "",
    address: "", nextOfKin: "",
    paymentType: "private" as "private" | "hmo",
    activeHmoId: "",
    enrolleeNumber: "",
    hmoCoverageType: "principal" as "principal" | "dependent",
    hmoPrincipalName: "",
    hmoRelationship: "",
    priority: "normal" as "normal" | "follow_up" | "emergency",
  });

  // Verification state
  const [verifyStatus, setVerifyStatus] = useState<VerificationStatus>("not_verified");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [showWarn, setShowWarn] = useState(false);

  useEffect(() => {
    if (!cid) return;
    apiClient.from("hmos")
      .select("id, name, website, claims_portal_url, phone, email")
      .eq("clinic_id", cid).eq("status", "active").order("name")
      .then(({ data }) => { if (data) setHmos(data as any); });
  }, [cid]);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const selectedHmo = useMemo(
    () => hmos.find(h => h.id === form.activeHmoId) || null,
    [hmos, form.activeHmoId]
  );
  const hmoUrl = normalizeUrl(selectedHmo?.website);

  // Reset verification when HMO/enrollee changes
  useEffect(() => {
    setVerifyStatus("not_verified");
    setVerifiedAt(null);
    setVerifyNotes("");
    setIframeFailed(false);
  }, [form.activeHmoId, form.enrolleeNumber, form.paymentType]);

  const openVerify = () => {
    if (!selectedHmo) { toast.error("Select an HMO first"); return; }
    if (!form.enrolleeNumber.trim()) { toast.error("Enter the enrollee number first"); return; }
    if (!hmoUrl) { toast.error("This HMO has no website URL configured"); return; }
    setIframeFailed(false);
    setSiteOpen(true);
  };

  const markVerified = () => {
    setVerifyStatus("verified");
    setVerifiedAt(new Date().toISOString());
    setSiteOpen(false);
    toast.success("HMO marked as verified");
  };
  const markRejected = () => {
    setVerifyStatus("rejected");
    setVerifiedAt(new Date().toISOString());
    setSiteOpen(false);
    toast.message("HMO marked as rejected");
  };

  const doSubmit = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    setLoading(true);
    const { data, error } = await apiClient.from("patients").insert({
      clinic_id: cid,
      full_name: form.fullName.trim(),
      age: parseInt(form.age),
      gender: form.gender,
      phone: form.phone.trim(),
      address: form.address.trim(),
      next_of_kin: form.nextOfKin.trim(),
      payment_type: form.paymentType,
      active_hmo_id: form.paymentType === "hmo" ? form.activeHmoId : null,
      enrollee_number: form.paymentType === "hmo" ? form.enrolleeNumber.trim() : "",
      hmo_coverage_type: form.paymentType === "hmo" ? form.hmoCoverageType : null,
      hmo_principal_name: form.paymentType === "hmo" && form.hmoCoverageType === "dependent"
        ? form.hmoPrincipalName.trim() : null,
      hmo_relationship: form.paymentType === "hmo" && form.hmoCoverageType === "dependent"
        ? form.hmoRelationship : null,
      hmo_verification_status: form.paymentType === "hmo" ? verifyStatus : null,
      hmo_verified_at: form.paymentType === "hmo" && verifyStatus !== "not_verified" ? verifiedAt : null,
      hmo_verified_by: form.paymentType === "hmo" && verifyStatus !== "not_verified" ? (user?.id ?? null) : null,
      hmo_verification_notes: form.paymentType === "hmo" ? (verifyNotes.trim() || null) : null,
      priority: form.priority,
      queue_status: "waiting",
    } as any).select().single();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient registered");
    navigate(`/patient/${data!.id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.age || !form.gender) {
      toast.error("Fill required fields (Name, Age, Gender)"); return;
    }
    if (form.paymentType === "hmo" && !form.activeHmoId) {
      toast.error("Select HMO provider"); return;
    }
    if (form.paymentType === "hmo" && form.hmoCoverageType === "dependent" && !form.hmoPrincipalName.trim()) {
      toast.error("Enter principal name"); return;
    }
    if (form.paymentType === "hmo" && verifyStatus === "not_verified") {
      setShowWarn(true); return;
    }
    doSubmit();
  };

  // Verification status badge
  const StatusBadge = () => {
    if (form.paymentType !== "hmo") return null;
    const map = {
      not_verified: { Icon: ShieldAlert, label: "Not Verified", cls: "text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30" },
      verified: { Icon: ShieldCheck, label: "Verified", cls: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30" },
      rejected: { Icon: ShieldX, label: "Rejected", cls: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30" },
    }[verifyStatus];
    const { Icon } = map;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${map.cls}`}>
        <Icon size={14} /> {map.label}
      </span>
    );
  };

  return (
    <>
      <h1 className="page-header mb-5">Register Patient</h1>
      <form onSubmit={handleSubmit} className="form-section max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Full Name *</Label><Input className="rounded-xl" value={form.fullName} onChange={e => set("fullName", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"> <Label className="text-xs font-medium">Date of Birth</Label>

          <Input
  className="rounded-xl h-11 text-sm font-medium"
  type="text"
  placeholder="DD/MM/YYYY"
  value={form.dateOfBirth}
  onChange={(e) => set("dateOfBirth", e.target.value)}
/>
</div>

            <div className="grid grid-cols-2 gap-2">
  <div className="space-y-1">
    <Label className="text-xs">Age *</Label>
    <Input
      className="rounded-xl h-11"
      type="number"
      min={0}
      max={150}
      placeholder="Enter age"
      value={form.age}
      onChange={(e) => set("age", e.target.value)}
    />
  </div>

  <div className="space-y-1">
    <Label className="text-xs">Age Unit *</Label>
    <Select
      value={form.ageUnit}
      onValueChange={(v) => set("ageUnit", v)}
    >
      <SelectTrigger className="rounded-xl">
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        <SelectItem value="years">Years</SelectItem>
        <SelectItem value="months">Months</SelectItem>
        <SelectItem value="weeks">Weeks</SelectItem>
        <SelectItem value="days">Days</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
            <div className="space-y-1"><Label className="text-xs">Gender *</Label>
              <Select value={form.gender} onValueChange={v => set("gender", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Phone</Label><Input className="rounded-xl" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Next of Kin</Label><Input className="rounded-xl" value={form.nextOfKin} onChange={e => set("nextOfKin", e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Address</Label><Textarea className="rounded-xl" value={form.address} onChange={e => set("address", e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label className="text-xs">Payment Type *</Label>
            <Select value={form.paymentType} onValueChange={v => set("paymentType", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private (Self-pay)</SelectItem>
                <SelectItem value="hmo">HMO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Priority</Label>
            <Select value={form.priority} onValueChange={v => set("priority", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.paymentType === "hmo" && (
            <>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">HMO Provider *</Label>
                <div className="flex gap-2">
                  <Select value={form.activeHmoId} onValueChange={v => set("activeHmoId", v)}>
                    <SelectTrigger className="rounded-xl flex-1"><SelectValue placeholder="Select HMO" /></SelectTrigger>
                    <SelectContent>
                      {hmos.length === 0
                        ? <SelectItem value="__none__" disabled>No HMOs configured</SelectItem>
                        : hmos.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl shrink-0"
                    onClick={openVerify}
                    disabled={!selectedHmo || !hmoUrl}
                    title={!hmoUrl ? "This HMO has no website URL" : "Open HMO portal to verify"}
                  >
                    <Globe size={14} className="mr-1" /> Verify HMO
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Enrollee Number</Label>
                <Input className="rounded-xl" value={form.enrolleeNumber} onChange={e => set("enrolleeNumber", e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Verification Status</Label>
                <div className="h-10 flex items-center"><StatusBadge /></div>
              </div>

              {verifyStatus !== "not_verified" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Verification Notes (optional)</Label>
                  <Textarea className="rounded-xl" rows={2} value={verifyNotes}
                    onChange={e => setVerifyNotes(e.target.value)}
                    placeholder="Plan tier, coverage limits, reference number, reason for rejection…" />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Using another person's HMO?</Label>
                <Select value={form.hmoCoverageType} onValueChange={v => set("hmoCoverageType", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="principal">No</SelectItem>
                    <SelectItem value="dependent">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.hmoCoverageType === "dependent" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Principal Name</Label>
                    <Input className="rounded-xl" value={form.hmoPrincipalName}
                      onChange={e => set("hmoPrincipalName", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Relationship</Label>
                    <Select value={form.hmoRelationship} onValueChange={v => set("hmoRelationship", v)}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spouse">Spouse</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                        <SelectItem value="sibling">Sibling</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" className="rounded-xl" disabled={loading}>{loading ? "Saving..." : "Register"}</Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate("/")}>Cancel</Button>
        </div>
      </form>

      {/* Embedded HMO portal */}
      <Dialog open={siteOpen} onOpenChange={setSiteOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Globe size={16} /> Verify {selectedHmo?.name} — Enrollee: {form.enrolleeNumber || "—"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {iframeFailed ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  This HMO portal blocks embedding. Open it in a new tab to verify, then come back to mark the status.
                </p>
                <a href={hmoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary underline">
                  <ExternalLink size={14} /> Open {selectedHmo?.name} portal
                </a>
              </div>
            ) : (
              <iframe
                src={hmoUrl}
                title={`${selectedHmo?.name} portal`}
                className="w-full h-full border-0"
                onError={() => setIframeFailed(true)}
              />
            )}
          </div>
          <DialogFooter className="px-4 py-3 border-t flex-row sm:justify-between gap-2">
            <a href={hmoUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink size={12} /> Open in new tab
            </a>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={markRejected}>
                <XCircle size={14} className="mr-1" /> Mark Rejected
              </Button>
              <Button type="button" onClick={markVerified}>
                <CheckCircle2 size={14} className="mr-1" /> Mark Verified
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unverified warning */}
      <AlertDialog open={showWarn} onOpenChange={setShowWarn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="text-yellow-600" size={18} /> HMO has not been verified
            </AlertDialogTitle>
            <AlertDialogDescription>
              You're about to register this patient without verifying their HMO eligibility.
              You can verify now or continue and verify later from the patient record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Verify First</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowWarn(false); doSubmit(); }}>
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
