import OptoLoader from "@/components/OptoLoader";
import EmptyState from "@/components/EmptyState";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ChevronRight, UserPlus, Phone, MessageCircle, Users, Play,
  CheckCircle,
  XCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "@/hooks/useAccess";
import { useRole } from "@/hooks/useRole";
import { offlineStore } from "@/lib/offlineStore";
import { cachePatientsOffline, cacheVisitsOffline, cacheStaffProfilesOffline } from "@/lib/offlineEngine";
import { useOffline } from "@/hooks/useOffline";
import PatientHistoryMeta from "@/components/patients/PatientHistoryMeta";
import { buildBillingSummaryMap, buildVisitSummaryMap, getPaymentStatus, type PatientBillingSummary, type PatientVisitSummary } from "@/lib/patientHistory";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { diagnoseRequestFailure, type DiagnosisCode } from "@/lib/diag/connectionDiagnosis";

interface PatientRow {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  phone: string;
  payment_type: string;
  active_hmo_id: string | null;
  queue_number: number;
  patient_number: string | null;
  hmo_name?: string;
  last_visit?: string | null;
  hmo_verification_status?: string | null;
  balance?: number;
  visitSummary: PatientVisitSummary;
  billingSummary: PatientBillingSummary;
  family_id?: string | null;
  family_name?: string | null;
  hmoClaimStatus?: string | null;
  hmoClaimAmount?: number;
  patientPayable?: number;
  hmoClaimId?: string | null;
}


function getCurrentPatientAge(dateOfBirth: string | null | undefined, storedAge: number | null | undefined) {
  if (!dateOfBirth) return storedAge !== null && storedAge !== undefined ? `${storedAge} years` : "—";
  const dob = new Date(dateOfBirth);
  const today = new Date();
  if (Number.isNaN(dob.getTime()) || dob > today) return storedAge !== null && storedAge !== undefined ? `${storedAge} years` : "—";
  let years = today.getFullYear() - dob.getFullYear();
  const monthDifference = today.getMonth() - dob.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < dob.getDate())) years--;
  if (years >= 1) return `${years} ${years === 1 ? "year" : "years"}`;
  const differenceInDays = Math.floor((today.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24));
  if (differenceInDays < 7) return `${differenceInDays} ${differenceInDays === 1 ? "day" : "days"}`;
  if (differenceInDays < 30) {
    const weeks = Math.floor(differenceInDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  const months = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth()) - (today.getDate() < dob.getDate() ? 1 : 0);
  return `${Math.max(1, months)} ${months === 1 ? "month" : "months"}`;
}

export default function PatientList() {
  const { effectiveClinicId: cid } = useAccess();
  const { isAdmin, isReceptionist, loading: roleLoading } = useRole();
  const canViewPayments = isAdmin || isReceptionist;
  const { isOffline } = useOffline();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"all" | "hmo" | "private" | "family">("all");
  const [selectedHmo, setSelectedHmo] = useState("");
  const [selectedFamily, setSelectedFamily] = useState("");
  const [hmoOptions, setHmoOptions] = useState<{ id: string; name: string }[]>([]);
  const [familyOptions, setFamilyOptions] = useState<{ id: string; family_name: string; family_number?: string | null }[]>([]);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<DiagnosisCode | null>(null);
  const [feedbackStatusMap, setFeedbackStatusMap] = useState<Record<string, "none" | "pending" | "completed">>({});
  const [feedbackFollowups, setFeedbackFollowups] = useState<any[]>([]);
  const [selectedFollowup, setSelectedFollowup] = useState<any | null>(null);
  const [followupDialogOpen, setFollowupDialogOpen] = useState(false);
  const [followupAction, setFollowupAction] = useState<"complete" | "cancel" | null>(null);
  const [followupNotes, setFollowupNotes] = useState("");
  const [updatingFollowup, setUpdatingFollowup] = useState(false);
  const [clinicStaff, setClinicStaff] = useState<any[]>([]);
  const [assigningFollowup, setAssigningFollowup] = useState(false);
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter");

  const patientListStateKey = `optocare:patient-list-state:${filter || "all"}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(patientListStateKey) || "{}");
      if (typeof saved.search === "string") setSearch(saved.search);
      if (["all", "hmo", "private", "family"].includes(saved.searchMode)) setSearchMode(saved.searchMode);
      if (typeof saved.selectedHmo === "string") setSelectedHmo(saved.selectedHmo);
      if (typeof saved.selectedFamily === "string") setSelectedFamily(saved.selectedFamily);
      if (typeof saved.showAdvancedSearch === "boolean") setShowAdvancedSearch(saved.showAdvancedSearch);
    } catch {}
  }, [patientListStateKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(patientListStateKey, JSON.stringify({
        search, searchMode, selectedHmo, selectedFamily, showAdvancedSearch,
      }));
    } catch {}
  }, [patientListStateKey, search, searchMode, selectedHmo, selectedFamily, showAdvancedSearch]);

  useEffect(() => {
    if (!cid) { setPatients([]); setLoading(false); return; }
    if (roleLoading) return;
    const cacheKey = `patients:${cid}`;
    const loadFromCache = (failureCode: DiagnosisCode | null = null) => {
      const allCached = offlineStore.get<PatientRow[]>(`patients:${cid}:all`);
      const cached = allCached || offlineStore.get<PatientRow[]>(cacheKey);
      if (cached) {
        // Older cache entries may contain raw patient rows. Normalize them so
        // a stale/offline cache can never crash the patient cards.
        const normalized = cached.map((patient: any) => ({
          ...patient,
          visitSummary: patient.visitSummary || { visitCount: 0, lastVisit: null },
          billingSummary: patient.billingSummary || getPaymentStatus([], patient.payment_type),
          balance: Number(patient.balance || 0),
          patientPayable: Number(patient.patientPayable || 0),
          hmoClaimAmount: Number(patient.hmoClaimAmount || 0),
          hmoClaimStatus: patient.hmoClaimStatus || null,
          hmoClaimId: patient.hmoClaimId || null,
        })) as PatientRow[];
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const visible = filter === "thismonth"
          ? normalized.filter((patient: any) => new Date(patient.created_at) >= monthStart)
          : normalized;
        setPatients(visible);
      }
      setLoadError(failureCode);
      setLoading(false);
    };
    if (isOffline) { loadFromCache("NO_NETWORK"); return; }

    (async () => {
      try {
        if (filter === "followup") {
          const { data: followupData, error: followupError } = await apiClient.rpc("get_dashboard_feedback_followups", { p_clinic_id: cid });
          if (!followupError) setFeedbackFollowups(followupData ?? []); else setFeedbackFollowups([]);
        }
        const { data: clinicStaffRows, error: clinicStaffError } = await apiClient.from("clinic_users").select("user_id, role").eq("clinic_id", cid);
        if (!clinicStaffError && clinicStaffRows) {
          const staffUserIds = clinicStaffRows.map((staff: any) => staff.user_id).filter(Boolean);
          if (staffUserIds.length > 0) {
            const { data: staffProfiles } = await apiClient.from("profiles").select("id, full_name, role, is_active, is_super_admin").in("id", staffUserIds).eq("is_active", true);
            const profileMap = new Map((staffProfiles || []).map((profile: any) => [profile.id, profile]));
            const staffCandidates = clinicStaffRows.map((staff: any) => {
              const profile = profileMap.get(staff.user_id);
              if (!profile || !profile.full_name) return null;
              return {
                id: staff.user_id,
                full_name: String(profile.full_name).trim(),
                role: staff.role || profile.role,
                is_super_admin: !!profile.is_super_admin,
              };
            }).filter(Boolean);
            const dedupedStaff = new Map<string, any>();
            staffCandidates.forEach((staff: any) => {
              const key = staff.full_name.toLowerCase().replace(/\\s+/g, " ").trim();
              const existing = dedupedStaff.get(key);
              if (!existing || (existing.is_super_admin && !staff.is_super_admin)) dedupedStaff.set(key, staff);
            });
            setClinicStaff(Array.from(dedupedStaff.values()).sort((a: any, b: any) => a.full_name.localeCompare(b.full_name)));
          } else setClinicStaff([]);
        } else setClinicStaff([]);

        // Always cache the complete patient list. Filtering is applied after
        // retrieval so a prior "this month" view can never overwrite the
        // offline cache with only a subset of patients.
        // Supabase/PostgREST can cap a response at 1,000 rows. Patient List
        // must never silently truncate a clinic, so fetch in deterministic pages.
        const allPatientData: any[] = [];
        const pageSize = 500;
        for (let page = 0; ; page++) {
          const { data: pageData, error: pageError } = await apiClient
            .from("patients")
            .select("*")
            .eq("clinic_id", cid)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(page * pageSize, page * pageSize + pageSize - 1);
          if (pageError) {
            const diagnosis = await diagnoseRequestFailure(pageError);
            loadFromCache(diagnosis.code);
            return;
          }
          if (!pageData || pageData.length === 0) break;
          allPatientData.push(...pageData);
          if (pageData.length < pageSize) break;
        }
        if (allPatientData.length === 0) {
          // An empty result is valid; do not treat it as a transport failure.
        }
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const data = filter === "thismonth"
          ? allPatientData.filter((patient: any) => new Date(patient.created_at) >= monthStart)
          : allPatientData;
        // IMPORTANT: the core patient list must not wait for HMO/family lookups.
        // Those are optional enrichment and are deliberately loaded after the
        // patient rows are rendered.
        const patientIds = data.map(p => p.id);
        const paymentTypes = new Map(data.map((p: any) => [p.id, p.payment_type]));
        // Keep the UI responsive for large clinics: related records are queried
        // in bounded batches instead of constructing oversized IN clauses.
        const chunk = <T,>(items: T[], size = 200) => {
          const out: T[][] = [];
          for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
          return out;
        };
        const baseRows = data.map((p: any) => ({
          ...p,
          hmo_name: undefined,
          family_name: undefined,
          balance: 0,
          patientPayable: 0,
          hmoClaimStatus: null,
          hmoClaimAmount: 0,
          hmoClaimId: null,
          visitSummary: { visitCount: 0, lastVisit: null },
          billingSummary: getPaymentStatus([], p.payment_type),
          feedbackStatus: "none",
        }));
        setPatients(baseRows);
        setLoadError(null);
        setLoading(false);
        offlineStore.save(cacheKey, baseRows);
        // Store the enriched row shape even for the offline "all" cache.
        // Never overwrite it with raw patient records that lack visit/billing summaries.
        offlineStore.save(`patients:${cid}:all`, baseRows);
        cachePatientsOffline(cid, baseRows);

        // Optional HMO/family enrichment. Failure here must never affect the
        // already-visible patient list.
        void (async () => {
          try {
            const hmoResult = await apiClient.from("hmos").select("id, name").eq("clinic_id", cid).eq("status", "active").order("name");
            const hmoMap = new Map<string, string>();
            if (hmoResult.data) {
              setHmoOptions(hmoResult.data as { id: string; name: string }[]);
              hmoResult.data.forEach((h: any) => hmoMap.set(h.id, h.name));
            }
            const familyIds = [...new Set(data.map((p: any) => p.family_id).filter(Boolean))];
            const familyMap = new Map<string, string>();
            if (familyIds.length > 0) {
              const familyResult = await apiClient.from("families").select("id, family_name, family_number").eq("clinic_id", cid).in("id", familyIds as string[]);
              (familyResult.data || []).forEach((family: any) => familyMap.set(family.id, family.family_name));
            }
            const allFamilyResult = await apiClient.from("families").select("id, family_name, family_number").eq("clinic_id", cid).order("family_name");
            if (allFamilyResult.data) setFamilyOptions(allFamilyResult.data as any);
            setPatients(prev => prev.map((p: any) => ({
              ...p,
              hmo_name: p.active_hmo_id ? hmoMap.get(p.active_hmo_id) : undefined,
              family_name: p.family_id ? familyMap.get(p.family_id) : undefined,
            })));
          } catch (enrichmentError) {
            console.warn("PatientList HMO/family enrichment unavailable:", enrichmentError);
          }
        })();
        setLoadError(null);
        setLoading(false);
        // Core patient cache was saved immediately above.

        if (patientIds.length === 0) return;

        try {
          const visitRows: any[] = [];
          const bills: any[] = [];
          const hmoClaims: any[] = [];

          for (const ids of chunk(patientIds)) {
            const [visitResponse, billingResponse, hmoClaimsResponse] = await Promise.all([
              apiClient.from("visits")
                .select(isReceptionist ? "id, patient_id, created_at, status" : "*")
                .eq("clinic_id", cid).in("patient_id", ids)
                .order("created_at", { ascending: false }),
              canViewPayments
                ? apiClient.from("billing")
                    .select("id, patient_id, total_amount, balance, amount_paid, status, payer_type, hmo_id, hmo_covered_amount, patient_payable, created_at")
                    .eq("clinic_id", cid).in("patient_id", ids)
                : Promise.resolve({ data: [] as any[], error: null }),
              canViewPayments
                ? apiClient.from("hmo_claims")
                    .select("id, patient_id, billing_id, hmo_id, service_cost, approved_amount, status, hmo_request_sent, hmo_request_sent_at, hmo_request_status, hmo_request_response_at, hmo_request_remarks, claim_sent, claim_sent_at, claim_response_status, claim_response_at, claim_response_remarks, created_at, updated_at")
                    .eq("clinic_id", cid).in("patient_id", ids)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [] as any[] }),
            ]);
            if (!visitResponse.error) visitRows.push(...(visitResponse.data || []));
            if (!billingResponse.error) bills.push(...(billingResponse.data || []));
            if (!hmoClaimsResponse.error) hmoClaims.push(...(hmoClaimsResponse.data || []));
          }

          const latestVisitByPatient = new Map<string, any>();
          visitRows.forEach((visit: any) => {
            if (!latestVisitByPatient.has(visit.patient_id)) latestVisitByPatient.set(visit.patient_id, visit);
          });

          const latestClaimByPatient = new Map<string, any>();
          hmoClaims.forEach((claim: any) => {
            if (!latestClaimByPatient.has(claim.patient_id)) latestClaimByPatient.set(claim.patient_id, claim);
          });

          const balanceMap = new Map<string, number>();
          bills.forEach((bill: any) => {
            const current = balanceMap.get(bill.patient_id) || 0;
            balanceMap.set(bill.patient_id, current + Number(bill.balance || 0));
          });

          const visitSummaryMap = buildVisitSummaryMap(visitRows);
          const billingSummaryMap = buildBillingSummaryMap(bills, paymentTypes);

          const enrichedRows = baseRows.map((p: any) => {
            const patientBills = bills.filter((bill: any) => bill.patient_id === p.id);
            const latestBill = patientBills.length > 0
              ? patientBills.reduce((latest: any, bill: any) =>
                  !latest || String(bill.created_at || "") > String(latest.created_at || "") ? bill : latest, null)
              : null;
            const latestClaim = latestClaimByPatient.get(p.id);
            const claimAmount = latestClaim
              ? Number(latestClaim.approved_amount || 0) > 0
                ? Number(latestClaim.approved_amount)
                : Number(latestClaim.service_cost || 0)
              : Number(latestBill?.hmo_covered_amount || 0);
            const patientPayable = patientBills.reduce(
              (sum: number, bill: any) => sum + Number(bill.patient_payable || 0), 0,
            );

            return {
              ...p,
              balance: balanceMap.get(p.id) || 0,
              patientPayable,
              hmoClaimStatus: latestClaim?.status || null,
              hmoClaimAmount: claimAmount,
              hmoClaimId: latestClaim?.id || null,
              hmoRequestSent: Boolean(latestClaim?.hmo_request_sent),
              hmoRequestSentAt: latestClaim?.hmo_request_sent_at || null,
              hmoRequestStatus: latestClaim?.hmo_request_status || "Not sent",
              hmoRequestResponseAt: latestClaim?.hmo_request_response_at || null,
              hmoRequestRemarks: latestClaim?.hmo_request_remarks || null,
              hmoClaimSent: Boolean(latestClaim?.claim_sent),
              hmoClaimSentAt: latestClaim?.claim_sent_at || null,
              hmoClaimResponseStatus: latestClaim?.claim_response_status || "Pending",
              hmoClaimResponseAt: latestClaim?.claim_response_at || null,
              hmoClaimResponseRemarks: latestClaim?.claim_response_remarks || null,
              visitSummary: visitSummaryMap.get(p.id) || { visitCount: 0, lastVisit: null },
              billingSummary: billingSummaryMap.get(p.id) || getPaymentStatus([], p.payment_type),
            };
          });

          setPatients(enrichedRows);
          offlineStore.save(cacheKey, enrichedRows);
          // Keep the existing HMO enrichment from the row itself. The HMO
          // map belongs to the optional enrichment task above and must never
          // leak into this core enrichment scope.
          cachePatientsOffline(cid, enrichedRows);

          if (!isReceptionist && visitRows.length > 0) {
            const staffIds = Array.from(new Set(
              visitRows.flatMap((visit: any) => [visit.doctor_id, visit.registered_by]).filter(Boolean),
            ));
            if (staffIds.length > 0) {
              const { data: staffProfiles } = await apiClient
                .from("profiles")
                .select("id, full_name, role, title, is_active")
                .in("id", staffIds);
              if (staffProfiles) cacheStaffProfilesOffline(cid, staffProfiles);
            }
          }
        } catch (enrichmentError) {
          // The patient list is already rendered. A billing/visit/HMO
          // enrichment failure must not blank the page or replace it with an
          // error state.
          console.warn("PatientList enrichment unavailable:", enrichmentError);
        }
      } catch (error) {
        console.error("PatientList loading error:", error);
        loadFromCache();
      }
    })();
  }, [cid, isOffline, canViewPayments, roleLoading, filter]);

  const openFollowupAction = (followup: any, action: "complete" | "cancel") => {
    setSelectedFollowup(followup); setFollowupAction(action); setFollowupNotes(""); setFollowupDialogOpen(true);
  };
  const handleUpdateFollowup = async () => {
    if (!selectedFollowup || !followupAction) return;
    const notes = followupNotes.trim();
    if (!notes) { alert(followupAction === "complete" ? "Please enter the resolution notes." : "Please enter the cancellation reason."); return; }
    setUpdatingFollowup(true);
    try {
      const status = followupAction === "complete" ? "completed" : "cancelled";
      const { error } = await apiClient.rpc("update_feedback_followup", { p_followup_id: selectedFollowup.id, p_status: status, p_assigned_to: selectedFollowup.assigned_to || null, p_notes: notes });
      if (error) throw error;
      setFeedbackFollowups(prev => prev.filter(item => item.id !== selectedFollowup.id));
      setFollowupDialogOpen(false); setSelectedFollowup(null); setFollowupAction(null); setFollowupNotes("");
    } catch (error) { console.error("Failed to update follow-up:", error); alert("Unable to update this follow-up. Please try again."); }
    finally { setUpdatingFollowup(false); }
  };
  const normalizedSearch = search.trim().toLowerCase().replace(/[\\p{P}\\p{S}]+/gu, " ").replace(/\\s+/g, " ");
  const searchTerms = normalizedSearch.split(" ").filter(Boolean);
  const wantsHmo = searchTerms.includes("hmo") || searchTerms.includes("insurance") || searchTerms.includes("insurer");
  const wantsFamily = searchTerms.includes("family") || searchTerms.includes("families");
  const wantsPrivate = searchTerms.includes("private");
  const wantsPaid = searchTerms.includes("paid");
  const wantsDue = searchTerms.includes("due") || searchTerms.includes("owing") || searchTerms.includes("owe");
  const wantsHmoAttention = searchTerms.includes("attention") || searchTerms.includes("pending");
  const filtered = patients.filter(p => {
    const isHmo = p.payment_type === "hmo";
    const isFamily = !!p.family_id;
    const matchesMode =
      searchMode === "all"
        ? true
        : searchMode === "hmo"
          ? isHmo
          : searchMode === "private"
            ? !isHmo
            : isFamily;
    if (!matchesMode) return false;

    if (selectedHmo && p.active_hmo_id !== selectedHmo) return false;
    if (selectedFamily && p.family_id !== selectedFamily) return false;

    const explicitCategory = wantsHmo || wantsFamily || wantsPrivate;
    const isHmoAttention = isHmo && (!p.hmoClaimStatus || ["pending", "requested", "submitted", "sent", "processing", "approved"].includes(String(p.hmoClaimStatus).toLowerCase()));
    const isPaid = !isHmo ? p.billingSummary?.paymentStatus === "Paid" : false;
    const isDue = !isHmo ? Number(p.balance || 0) > 0 : Number(p.patientPayable || 0) > 0;
    const categoryMatches =
      (!wantsHmo || isHmo) &&
      (!wantsFamily || isFamily) &&
      (!wantsPrivate || !isHmo);

    const termsToMatch = searchTerms.filter(term =>
      !["all", "patient", "patients", "hmo", "insurance", "insurer", "family", "families", "private", "paid", "due", "owing", "owe", "attention", "pending"].includes(term)
    );

    if (!categoryMatches) return false;
    if (wantsPaid && !isPaid) return false;
    if (wantsDue && !isDue) return false;
    if (wantsHmoAttention && !isHmoAttention) return false;
    if (termsToMatch.length === 0) return true;

    const haystack = [
      p.full_name,
      p.phone,
      p.patient_number,
      p.hmo_name,
      p.family_name,
      p.family_id,
      p.hmoClaimStatus,
    ].filter(Boolean).join(" ").toLowerCase();

    return termsToMatch.every(term => haystack.includes(term));
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5"><h1 className="page-header">{filter === "thismonth" ? "Patients This Month" : filter === "followup" ? "Patient Follow-ups" : "Patients"}</h1><Link to="/register"><Button size="sm" className="rounded-xl gap-1.5"><UserPlus size={14} /> New</Button></Link></div>
      <div className="sticky top-0 z-10 bg-background pb-3 mb-4 space-y-2">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder='Search patients, e.g. "All AXA Mansard HMO patients" or "All family patients"'
            className="pl-10 pr-20 rounded-xl bg-card h-11"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-11 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdvancedSearch(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Advanced patient search"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["all", "All Patients"],
            ["hmo", "HMO Patients"],
            ["private", "Private"],
            ["family", "Family Patients"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSearchMode(value as typeof searchMode)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${searchMode === value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {showAdvancedSearch && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3">
            <select
              value={selectedHmo}
              onChange={e => setSelectedHmo(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">All HMO providers</option>
              {hmoOptions.map(hmo => <option key={hmo.id} value={hmo.id}>{hmo.name}</option>)}
            </select>
            <select
              value={selectedFamily}
              onChange={e => setSelectedFamily(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">All families</option>
              {familyOptions.map(family => <option key={family.id} value={family.id}>{family.family_name}{family.family_number ? ` — ${family.family_number}` : ""}</option>)}
            </select>
          </div>
        )}

        {(search || selectedHmo || selectedFamily || searchMode !== "all") && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{filtered.length} patient{filtered.length === 1 ? "" : "s"} found</span>
            <button type="button" className="text-primary font-semibold" onClick={() => { setSearch(""); setSelectedHmo(""); setSelectedFamily(""); setSearchMode("all"); }}>
              Clear filters
            </button>
          </div>
        )}
      </div>
      {filter === "followup" ? (
        <div className="space-y-3">{feedbackFollowups.length === 0 ? <EmptyState icon={MessageCircle} title="No pending follow-ups" description="Patient feedback follow-ups that need attention will appear here." /> : feedbackFollowups.map((followup: any) => (
          <div key={followup.id} className="patient-card-surface medical-card p-4 rounded-3xl border shadow-md"><div className="flex items-start gap-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 bg-gradient-to-br from-blue-600 to-cyan-400"><span className="text-lg font-bold">{(followup.patient_name || "?")[0]}</span></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><p className="text-base font-bold truncate">{followup.patient_name}</p>{followup.patient_number && <span className="text-xs font-mono bg-primary/10 text-primary px-2.5 py-1 rounded-lg">{followup.patient_number}</span>}</div>{followup.phone && <p className="text-xs text-muted-foreground mt-1">{followup.phone}</p>}<div className="mt-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${followup.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{followup.status === "in_progress" ? "In Progress" : "Pending"}</span></div><div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs font-semibold text-foreground mb-1">Follow-up reason</p><p className="text-sm text-muted-foreground leading-relaxed">{followup.reason}</p></div><p className="text-[11px] text-muted-foreground mt-3">Created {new Date(followup.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</p><div className="mt-4 space-y-3"><div className="space-y-1.5"><label className="text-xs font-semibold text-foreground">Assigned to</label><select value={followup.assigned_to || ""} disabled={assigningFollowup} onChange={async (e) => { const staffId = e.target.value || null; setAssigningFollowup(true); try { const { error } = await apiClient.rpc("update_feedback_followup", { p_followup_id: followup.id, p_status: followup.status, p_assigned_to: staffId, p_notes: followup.notes || null }); if (error) throw error; setFeedbackFollowups(prev => prev.map(item => item.id === followup.id ? { ...item, assigned_to: staffId } : item)); } catch (error) { console.error("Failed to assign follow-up:", error); alert("Unable to assign this follow-up. Please try again."); } finally { setAssigningFollowup(false); } }} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"><option value="">Unassigned</option>{clinicStaff.map((staff: any) => <option key={staff.id} value={staff.id}>{staff.full_name} — {staff.role}</option>)}</select></div><div className="flex flex-wrap gap-2">{followup.status === "pending" && <Button size="sm" className="rounded-xl gap-1.5" onClick={async () => { setUpdatingFollowup(true); try { const { error } = await apiClient.rpc("update_feedback_followup", { p_followup_id: followup.id, p_status: "in_progress", p_assigned_to: followup.assigned_to || null, p_notes: followup.notes || null }); if (error) throw error; setFeedbackFollowups(prev => prev.map(item => item.id === followup.id ? { ...item, status: "in_progress" } : item)); } catch (error) { console.error("Failed to start follow-up:", error); alert("Unable to start this follow-up. Please try again."); } finally { setUpdatingFollowup(false); } }} disabled={updatingFollowup}><Play size={14} />{updatingFollowup ? "Starting..." : "Start Follow-up"}</Button>}{followup.status === "in_progress" && <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => openFollowupAction(followup, "complete")} disabled={updatingFollowup}><CheckCircle size={14} />Complete</Button>}<Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-destructive" onClick={() => openFollowupAction(followup, "cancel")} disabled={updatingFollowup}><XCircle size={14} />Cancel</Button></div></div></div><Link to={`/patient/${followup.patient_id}`} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0" title="Open patient"><ChevronRight size={16} className="text-primary" /></Link></div></div>
        ))}</div>
      ) : loading ? <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div> : loadError && patients.length === 0 ? <EmptyState icon={Users} title={loadError === "NO_NETWORK" || loadError === "NO_INTERNET" ? "Connection lost. Your records are safe." : loadError === "DATABASE_SERVICE" || loadError === "AUTH_SERVICE" || loadError === "EDGE_FUNCTION" ? "Something went wrong. Your records are safe." : "Something went wrong. Your records are safe."} description="Please try again shortly." /> : filtered.length === 0 ? <EmptyState icon={Users} title={patients.length === 0 ? "No patients registered yet" : "No matching patients"} description={patients.length === 0 ? "Register your first patient to start building records." : "Try a different name or phone number."} /> : <div className="space-y-2">{filtered.map(p => { const isHmo = p.payment_type === "hmo"; return <div key={p.id} className="patient-card-surface medical-card p-4 flex items-center gap-3 rounded-3xl border shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"><Link to={`/patient/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0"><div className="relative shrink-0"><div title={isHmo ? "HMO Patient" : "Private Patient"} className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full z-20 ${isHmo ? "bg-amber-500" : "bg-green-500"}`} /><div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)" }}><span className="text-lg font-bold text-white">{(p.full_name || "?")[0]}</span></div></div><div className="flex-1 min-w-0 flex flex-col justify-center"><div className="flex items-center gap-2 flex-wrap"><p className="text-base font-bold truncate">{p.full_name}</p>{p.patient_number && <span className="text-xs font-mono bg-primary/10 text-primary px-2.5 py-1 rounded-lg">{p.patient_number}</span>}</div><div className="flex items-center gap-2 mt-1 flex-wrap"><span className="text-xs text-muted-foreground">{p.gender}</span><span className="text-xs text-muted-foreground">•</span><span className="text-xs text-muted-foreground">{getCurrentPatientAge(p.date_of_birth, p.age)}</span></div><div className="flex items-center gap-2 mt-2"><span className={`text-[11px] px-2 py-1 rounded-full font-medium ${isHmo ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>{isHmo ? (p.hmo_name || "HMO") : "PRIVATE"}</span></div><div className="mt-2"><span className="text-sm text-muted-foreground">{p.phone}</span></div>
<div className="mt-2 space-y-1.5">
  {isHmo ? (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-foreground">HMO Request:</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${String(p.hmoRequestStatus || "Not sent").toLowerCase() === "approved" ? "bg-green-100 text-green-700" : ["rejected","query"].includes(String(p.hmoRequestStatus || "").toLowerCase()) ? "bg-red-100 text-red-700" : p.hmoRequestSent ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
          {p.hmoRequestStatus || "Not sent"}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-foreground">HMO Claim:</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${String(p.hmoClaimResponseStatus || "Pending").toLowerCase() === "approved" ? "bg-green-100 text-green-700" : ["rejected","query"].includes(String(p.hmoClaimResponseStatus || "").toLowerCase()) ? "bg-red-100 text-red-700" : p.hmoClaimSent ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
          {p.hmoClaimSent ? (p.hmoClaimResponseStatus || "Pending") : "Not sent"}
        </span>
      </div>
      {Number(p.hmoClaimAmount || 0) > 0 && <div className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Amount to Claim:</span> ₦{Number(p.hmoClaimAmount || 0).toLocaleString()}</div>}
      {Number(p.patientPayable || 0) > 0 && <div className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Patient Co-pay:</span> ₦{Number(p.patientPayable || 0).toLocaleString()}</div>}
    </>
  ) : (
    <div className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Payment:</span> {p.billingSummary?.paymentStatus === "Paid" ? "Paid" : Number(p.balance || 0) > 0 ? `Due ₦${Number(p.balance || 0).toLocaleString()}` : "No billing"}</div>
  )}
</div>
<div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap"><span>Visits: {p.visitSummary.visitCount}</span><span>•</span><span>Last: {p.visitSummary.lastVisit ? new Date(p.visitSummary.lastVisit).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span></div><div className="mt-2">{p.feedbackStatus === "completed" ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700">✓ Feedback Completed</span> : p.feedbackStatus === "pending" ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">● Feedback Pending</span> : p.visitSummary.visitCount > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">○ No Feedback</span> : null}</div></div></Link><div className="flex items-center gap-1 shrink-0">{p.phone && <><a href={`tel:${p.phone}`} className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center hover:bg-green-100 transition-colors" title="Call"><Phone size={14} className="text-success" /></a><a href={`https://wa.me/${normalizeWhatsAppNumber(p.phone)}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center hover:bg-green-100 transition-colors" title="WhatsApp"><MessageCircle size={14} className="text-success" /></a></>}<Link to={`/patient/${p.id}`} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"><ChevronRight size={16} className="text-primary" /></Link></div></div>; })}</div>}
      <Dialog open={followupDialogOpen} onOpenChange={(open) => { if (!updatingFollowup) { setFollowupDialogOpen(open); if (!open) { setSelectedFollowup(null); setFollowupAction(null); setFollowupNotes(""); } } }}><DialogContent className="rounded-3xl"><DialogHeader><DialogTitle>{followupAction === "complete" ? "Complete Follow-up" : "Cancel Follow-up"}</DialogTitle><DialogDescription>{followupAction === "complete" ? "Confirm that this patient follow-up has been resolved." : "Are you sure you want to cancel this patient follow-up?"}</DialogDescription></DialogHeader><div className="space-y-3"><div><p className="text-sm font-semibold">Patient</p><p className="text-sm text-muted-foreground">{selectedFollowup?.patient_name || "—"}</p></div><div><label className="text-sm font-semibold">{followupAction === "complete" ? "Resolution notes" : "Cancellation reason"}</label><Textarea value={followupNotes} onChange={(e) => setFollowupNotes(e.target.value)} placeholder={followupAction === "complete" ? "Describe what was done to resolve the patient's issue..." : "Enter the reason for cancelling this follow-up..."} className="mt-2 min-h-[120px] rounded-xl" /></div></div><DialogFooter className="gap-2"><Button type="button" variant="outline" className="rounded-xl" onClick={() => { if (updatingFollowup) return; setFollowupDialogOpen(false); setSelectedFollowup(null); setFollowupAction(null); setFollowupNotes(""); }} disabled={updatingFollowup}>Cancel</Button><Button type="button" className="rounded-xl" onClick={handleUpdateFollowup} disabled={updatingFollowup || followupNotes.trim().length === 0}>{updatingFollowup ? "Saving..." : followupAction === "complete" ? "Complete Follow-up" : "Cancel Follow-up"}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
