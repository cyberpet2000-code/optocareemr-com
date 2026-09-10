import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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

type PatientMatch = {
  patient_id: string;
  patient_number: string | null;
  full_name: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
  date_of_birth: string | null;
  match_type?: string | null;
  match_score?: number | null;
};

type DuplicateSeverity = "strong" | "high" | "phone" | "name";

function normalizeUrl(u?: string | null) {
  if (!u) return "";
  const s = u.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function escapeLikeTerm(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightName(name: string, query: string) {
  const firstTerm = normalizeSearchText(query).split(" ")[0];
  if (!firstTerm) return name;

  const parts = name.split(new RegExp(`(${escapeRegExp(firstTerm)})`, "ig"));
  return parts.map((part, index) => part.toLowerCase() === firstTerm
    ? <mark key={`${part}-${index}`} className="rounded bg-primary/10 px-0.5 text-primary">{part}</mark>
    : <Fragment key={`${part}-${index}`}>{part}</Fragment>);
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

  const calculateAge = (dateOfBirth: string) => {
  if (!dateOfBirth) return "";

  const dob = new Date(dateOfBirth);
  const today = new Date();

  if (Number.isNaN(dob.getTime()) || dob > today) {
    return "";
  }

  let age = today.getFullYear() - dob.getFullYear();

  const monthDifference = today.getMonth() - dob.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < dob.getDate())
  ) {
    age--;
  }

  return age >= 0 ? String(age) : "";
};

  const getPatientDisplayAge = (
  dateOfBirth: string | null,
  storedAge: number | null
) => {
  if (dateOfBirth) {
    const calculatedAge = calculateAge(dateOfBirth);

    if (calculatedAge !== "") {
      return calculatedAge;
    }
  }

  return storedAge !== null && storedAge !== undefined
    ? String(storedAge)
    : "—";
};

  // Verification state
  const [verifyStatus, setVerifyStatus] = useState<VerificationStatus>("not_verified");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const [patientSearchResults, setPatientSearchResults] = useState<PatientMatch[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<PatientMatch[]>([]);
  const [duplicateSeverity, setDuplicateSeverity] = useState<DuplicateSeverity | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    if (!cid) return;
    apiClient.from("hmos")
      .select("id, name, website, claims_portal_url, phone, email , date_of_birth")
      .eq("clinic_id", cid).eq("status", "active").order("name")
      .then(({ data }) => { if (data) setHmos(data as any); });
  }, [cid]);

  useEffect(() => {
    const query = form.fullName.trim();
    const normalizedQuery = normalizeSearchText(query);
    const requestId = ++searchRequestRef.current;

    if (!cid || normalizedQuery.length < 2) {
      setPatientSearchResults([]);
      setPatientSearchLoading(false);
      return;
    }

    const searchTimer = window.setTimeout(async () => {
      setPatientSearchLoading(true);
      const terms = Array.from(new Set(normalizedQuery.split(" ").filter(Boolean))).slice(0, 3);

      const responses = await Promise.all(terms.map((term) => apiClient
        .from("patients")
        .select("id, full_name, patient_number, age, gender, phone")
        .eq("clinic_id", cid)
        .ilike("full_name", `%${escapeLikeTerm(term)}%`)
        .limit(10)));

      if (requestId !== searchRequestRef.current) return;

      const matches = new Map<string, PatientMatch>();
      responses.forEach(({ data }) => {
        (data || []).forEach((patient) => {
          const match = {
            patient_id: patient.id,
            patient_number: patient.patient_number,
            full_name: patient.full_name,
            phone: patient.phone,
            age: patient.age,
            gender: patient.gender,
            date_of_birth: patient.date_of_birth,
          } satisfies PatientMatch;
          const normalizedName = normalizeSearchText(match.full_name);
          if (normalizedQuery.split(" ").every((term) => normalizedName.includes(term))) {
            matches.set(match.patient_id, match);
          }
        });
      });

      setPatientSearchResults(Array.from(matches.values()).sort((left, right) => {
        const leftName = normalizeSearchText(left.full_name);
        const rightName = normalizeSearchText(right.full_name);
        return Number(!leftName.startsWith(normalizedQuery)) - Number(!rightName.startsWith(normalizedQuery))
          || leftName.localeCompare(rightName);
      }).slice(0, 8));
      setPatientSearchLoading(false);
    }, 300);

    return () => window.clearTimeout(searchTimer);
  }, [cid, form.fullName]);

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

  const openExistingPatient = (patientId: string) => {
    setShowDuplicateDialog(false);
    setPatientSearchResults([]);
    navigate(`/patient/${patientId}`);
  };

  const continueToSave = () => {
    if (form.paymentType === "hmo" && verifyStatus === "not_verified") {
      setShowWarn(true);
      return;
    }
    void doSubmit();
  };

  const doSubmit = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    setLoading(true);
    const { data, error } = await apiClient.from("patients").insert({
      clinic_id: cid,
      full_name: form.fullName.trim(),
      date_of_birth: form.dateOfBirth,
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
      hmo_verification_status: form.paymentType === "hmo" ? verifyStatus : "verified",
      hmo_verified_at: form.paymentType === "hmo" && verifyStatus !== "not_verified" ? verifiedAt : null,
      hmo_verified_by: form.paymentType === "hmo" && verifyStatus !== "not_verified" ? (user?.id ?? null) : null,
      hmo_verification_notes: form.paymentType === "hmo" ? (verifyNotes.trim() || null) : null,
      priority: form.priority,
      queue_status: "waiting",
    } as any).select().single();
    setLoading(false);
    if (error) {
      const errorMessage = error.message.toLowerCase();
      const isDuplicateConflict = error.code === "23505"
        || errorMessage.includes("duplicate")
        || errorMessage.includes("unique")
        || errorMessage.includes("patient_number");
      toast.error(isDuplicateConflict
        ? "This patient may have been registered by someone else. Search for the existing patient and open their record."
        : error.message);
      return;
    }
    toast.success("Patient registered");
    navigate(`/patient/${data!.id}`);
  };

  const checkForDuplicates = async () => {
    if (!cid) {
      toast.error("No active clinic");
      return;
    }

    setLoading(true);
    const { data, error } = await apiClient.rpc("check_duplicate_patient", {
      p_clinic_id: cid,
      p_full_name: form.fullName.trim(),
      p_phone: form.phone.trim(),
      p_age: parseInt(form.age, 10),
      p_gender: form.gender,
    });
    setLoading(false);

    if (error) {
      toast.error("We could not complete the duplicate check. Please try again.");
      return;
    }

    const matches = ((data || []) as PatientMatch[]).sort((left, right) => (right.match_score ?? 0) - (left.match_score ?? 0));
    if (matches.length === 0) {
      continueToSave();
      return;
    }

    const highestScore = matches[0]?.match_score ?? 0;
    const severity: DuplicateSeverity = highestScore >= 100
      ? "strong"
      : highestScore >= 85
        ? "high"
        : highestScore >= 60
          ? "phone"
          : "name";
    setDuplicateMatches(matches);
    setDuplicateSeverity(severity);
    setShowDuplicateDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
  !form.fullName.trim() ||
  !form.dateOfBirth ||
  !form.age ||
  !form.gender
) {
  toast.error("Please enter the patient's name, date of birth and gender");
  return;
    }
    if (form.paymentType === "hmo" && !form.activeHmoId) {
      toast.error("Select HMO provider"); return;
    }
    if (form.paymentType === "hmo" && form.hmoCoverageType === "dependent" && !form.hmoPrincipalName.trim()) {
      toast.error("Enter principal name"); return;
    }
    void checkForDuplicates();
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
          <div className="relative space-y-1">
            <Label className="text-xs">Full Name *</Label>
            <Input
              className="rounded-xl"
              value={form.fullName}
              onChange={e => {
                set("fullName", e.target.value);
                setPatientSearchResults([]);
              }}
              autoComplete="off"
              aria-describedby="patient-search-status"
            />
            {form.fullName.trim().length >= 2 && (patientSearchLoading || patientSearchResults.length > 0) && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
                {patientSearchLoading ? (
                  <div id="patient-search-status" className="px-3 py-2 text-xs text-muted-foreground">Searching existing patients…</div>
                ) : (
                  <div id="patient-search-status" className="max-h-72 overflow-y-auto p-1">
                    <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Existing patients</p>
                    {patientSearchResults.map((patient) => (
                      <Button
                        key={patient.patient_id}
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start rounded-lg px-2 py-2 text-left"
                        onClick={() => openExistingPatient(patient.patient_id)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{highlightName(patient.full_name, form.fullName)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {patient.patient_number || "No patient number"} • {getPatientDisplayAge(patient.date_of_birth, patient.age)} • {patient.gender || "—"}
                          </span>
                          {patient.phone && <span className="block truncate text-xs text-muted-foreground">{patient.phone}</span>}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"> <Label className="text-xs font-medium">Date of Birth</Label>

          <Input
  className="rounded-xl h-11 text-sm font-medium"
  type="date"
  value={form.dateOfBirth}
  max={new Date().toISOString().split("T")[0]}
  onChange={(e) => {
    const dateOfBirth = e.target.value;
    const age = calculateAge(dateOfBirth);

    set("dateOfBirth", dateOfBirth);
    set("age", age);
  }}
/>
</div>

            <div className="grid grid-cols-2 gap-2">
  <div className="space-y-1">
    <Label className="text-xs">Age *</Label>
    <Input
  className="rounded-xl h-11 bg-muted/50"
  type="number"
  value={form.age}
  readOnly
  placeholder="Calculated from date of birth"
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
            <AlertDialogAction onClick={() => { setShowWarn(false); void doSubmit(); }}>
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Existing-patient duplicate protection */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {duplicateSeverity === "strong" && "Patient already exists"}
              {duplicateSeverity === "high" && "Possible duplicate patient"}
              {duplicateSeverity === "phone" && "Phone number already in use"}
              {duplicateSeverity === "name" && "Similar patient name found"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateSeverity === "strong" && "A matching patient was found. Open the existing record instead of creating another patient."}
              {duplicateSeverity === "high" && "Review the matching patient details. Continue only if this is a different patient."}
              {duplicateSeverity === "phone" && "This may be a family or shared phone number. Review the existing patient before continuing."}
              {duplicateSeverity === "name" && "Please confirm that this is a new patient before continuing."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {duplicateMatches.map((patient) => (
              <div key={patient.patient_id} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{patient.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {patient.patient_number || "No patient number"} • {patient.age ?? "—"} • {patient.gender || "—"}
                    </p>
                    {patient.phone && <p className="text-xs text-muted-foreground">{patient.phone}</p>}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => openExistingPatient(patient.patient_id)}>
                    Open Existing Patient
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>
              {duplicateSeverity === "strong" ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {duplicateSeverity !== "strong" && (
              <AlertDialogAction onClick={() => { setShowDuplicateDialog(false); continueToSave(); }}>
                {duplicateSeverity === "high" ? "This is a different patient" : "Continue registration"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
