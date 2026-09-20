import OptoLoader from "@/components/OptoLoader";
import EmptyState from "@/components/EmptyState";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ChevronRight, UserPlus, Phone, MessageCircle, Users, FileText, Play,
  CheckCircle,
  XCircle,} from "lucide-react";
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
import { cachePatientOffline, cacheVisitsOffline } from "@/lib/offlineEngine";
import { useOffline } from "@/hooks/useOffline";
import PatientHistoryMeta from "@/components/patients/PatientHistoryMeta";
import { buildBillingSummaryMap, buildVisitSummaryMap, getPaymentStatus, type PatientBillingSummary, type PatientVisitSummary } from "@/lib/patientHistory";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";

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
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!cid) { setPatients([]); setLoading(false); return; }
    if (roleLoading) return;
    const cacheKey = `patients:${cid}`;
    const loadFromCache = () => {
      const cached = offlineStore.get<PatientRow[]>(cacheKey);
      if (cached) setPatients(cached);
      setLoading(false);
    };
    if (isOffline) { loadFromCache(); return; }

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

        let query = apiClient.from("patients").select("*").eq("clinic_id", cid);
        if (filter === "thismonth") {
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
          query = query.gte("created_at", monthStart);
        }
        const { data, error } = await query.order("created_at", { ascending: false });
        if (error || !data) { loadFromCache(); return; }
        const hmoIds = [...new Set(data.map((p: any) => p.active_hmo_id).filter(Boolean))];
        let hmoMap = new Map<string, string>();
        if (hmoIds.length > 0) {
          const { data: hmos } = await apiClient.from("hmos").select("id, name").eq("clinic_id", cid).in("id", hmoIds as string[]);
          hmoMap = new Map((hmos || []).map((h: any) => [h.id, h.name]));
        }
        const patientIds = data.map(p => p.id);
        const [visitResponse, billingResponse] = await Promise.all([
          apiClient.from("visits").select(isReceptionist ? "id, patient_id, created_at, status" : "*").eq("clinic_id", cid).in("patient_id", patientIds).order("created_at", { ascending: false }),
          canViewPayments ? apiClient.from("billing").select("patient_id, balance, amount_paid, status, payer_type").eq("clinic_id", cid).in("patient_id", patientIds) : Promise.resolve({ data: [] }),
        ]);
        const visitRows = visitResponse.data || [];
        const latestVisitByPatient = new Map<string, any>();
        visitRows.forEach((visit: any) => { if (!latestVisitByPatient.has(visit.patient_id)) latestVisitByPatient.set(visit.patient_id, visit); });
        const nextFeedbackStatusMap: Record<string, "none" | "pending" | "completed"> = {};
        setFeedbackStatusMap(nextFeedbackStatusMap);
        const bills = billingResponse.data || [];
        const balanceMap = new Map<string, number>();
        (bills || []).forEach((bill: any) => {
          const current = balanceMap.get(bill.patient_id) || 0;
          balanceMap.set(bill.patient_id, current + (bill.balance || 0));
        });
        const paymentTypes = new Map(data.map((p: any) => [p.id, p.payment_type]));
        const visitSummaryMap = buildVisitSummaryMap(visitRows || []);
        const billingSummaryMap = buildBillingSummaryMap(bills || [], paymentTypes);
        const rows = data.map((p: any) => ({ ...p, hmo_name: p.active_hmo_id ? hmoMap.get(p.active_hmo_id) : undefined, balance: balanceMap.get(p.id) || 0, visitSummary: visitSummaryMap.get(p.id) || { visitCount: 0, lastVisit: null }, billingSummary: billingSummaryMap.get(p.id) || getPaymentStatus([], p.payment_type), feedbackStatus: nextFeedbackStatusMap[p.id] || "none" }));
        setPatients(rows);
        offlineStore.save(cacheKey, rows);

        // Keep the clinical workspace useful when the connection drops.
        // Patient demographics are cached for every role. Full visit history
        // is cached only for roles that are allowed to see clinical details.
        rows.forEach((patient: any) => {
          cachePatientOffline(cid, {
            ...patient,
            hmo_name: patient.active_hmo_id ? hmoMap.get(patient.active_hmo_id) : undefined,
          });
        });
        if (!isReceptionist) {
          const visitsByPatient = new Map<string, any[]>();
          visitRows.forEach((visit: any) => {
            const list = visitsByPatient.get(visit.patient_id) || [];
            list.push(visit);
            visitsByPatient.set(visit.patient_id, list);
          });
          visitsByPatient.forEach((patientVisits, patientId) => {
            cacheVisitsOffline(cid, patientId, patientVisits);
          });
        }

        setLoading(false);
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
  const filtered = patients.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()) || p.phone?.includes(search));

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5"><h1 className="page-header">{filter === "thismonth" ? "Patients This Month" : filter === "followup" ? "Patient Follow-ups" : "Patients"}</h1><Link to="/register"><Button size="sm" className="rounded-xl gap-1.5"><UserPlus size={14} /> New</Button></Link></div>
      <div className="sticky top-0 z-10 bg-background pb-3 mb-4"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search name or phone..." className="pl-9 rounded-xl bg-card" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {filter === "followup" ? (
        <div className="space-y-3">{feedbackFollowups.length === 0 ? <EmptyState icon={MessageCircle} title="No pending follow-ups" description="Patient feedback follow-ups that need attention will appear here." /> : feedbackFollowups.map((followup: any) => (
          <div key={followup.id} className="medical-card p-4 rounded-3xl border border-slate-100 shadow-md bg-white"><div className="flex items-start gap-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 bg-gradient-to-br from-blue-600 to-cyan-400"><span className="text-lg font-bold">{(followup.patient_name || "?")[0]}</span></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><p className="text-base font-bold truncate">{followup.patient_name}</p>{followup.patient_number && <span className="text-xs font-mono bg-primary/10 text-primary px-2.5 py-1 rounded-lg">{followup.patient_number}</span>}</div>{followup.phone && <p className="text-xs text-muted-foreground mt-1">{followup.phone}</p>}<div className="mt-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${followup.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{followup.status === "in_progress" ? "In Progress" : "Pending"}</span></div><div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs font-semibold text-foreground mb-1">Follow-up reason</p><p className="text-sm text-muted-foreground leading-relaxed">{followup.reason}</p></div><p className="text-[11px] text-muted-foreground mt-3">Created {new Date(followup.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</p><div className="mt-4 space-y-3"><div className="space-y-1.5"><label className="text-xs font-semibold text-foreground">Assigned to</label><select value={followup.assigned_to || ""} disabled={assigningFollowup} onChange={async (e) => { const staffId = e.target.value || null; setAssigningFollowup(true); try { const { error } = await apiClient.rpc("update_feedback_followup", { p_followup_id: followup.id, p_status: followup.status, p_assigned_to: staffId, p_notes: followup.notes || null }); if (error) throw error; setFeedbackFollowups(prev => prev.map(item => item.id === followup.id ? { ...item, assigned_to: staffId } : item)); } catch (error) { console.error("Failed to assign follow-up:", error); alert("Unable to assign this follow-up. Please try again."); } finally { setAssigningFollowup(false); } }} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"><option value="">Unassigned</option>{clinicStaff.map((staff: any) => <option key={staff.id} value={staff.id}>{staff.full_name} — {staff.role}</option>)}</select></div><div className="flex flex-wrap gap-2">{followup.status === "pending" && <Button size="sm" className="rounded-xl gap-1.5" onClick={async () => { setUpdatingFollowup(true); try { const { error } = await apiClient.rpc("update_feedback_followup", { p_followup_id: followup.id, p_status: "in_progress", p_assigned_to: followup.assigned_to || null, p_notes: followup.notes || null }); if (error) throw error; setFeedbackFollowups(prev => prev.map(item => item.id === followup.id ? { ...item, status: "in_progress" } : item)); } catch (error) { console.error("Failed to start follow-up:", error); alert("Unable to start this follow-up. Please try again."); } finally { setUpdatingFollowup(false); } }} disabled={updatingFollowup}><Play size={14} />{updatingFollowup ? "Starting..." : "Start Follow-up"}</Button>}{followup.status === "in_progress" && <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => openFollowupAction(followup, "complete")} disabled={updatingFollowup}><CheckCircle size={14} />Complete</Button>}<Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-destructive" onClick={() => openFollowupAction(followup, "cancel")} disabled={updatingFollowup}><XCircle size={14} />Cancel</Button></div></div></div><Link to={`/patient/${followup.patient_id}`} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0" title="Open patient"><ChevronRight size={16} className="text-primary" /></Link></div></div>
        ))}</div>
      ) : loading ? <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div> : filtered.length === 0 ? <EmptyState icon={Users} title={patients.length === 0 ? "No patients registered yet" : "No matching patients"} description={patients.length === 0 ? "Register your first patient to start building records." : "Try a different name or phone number."} /> : <div className="space-y-2">{filtered.map(p => { const isHmo = p.payment_type === "hmo"; return <div key={p.id} className="medical-card p-4 flex items-center gap-3 rounded-3xl border border-slate-100 shadow-md bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"><Link to={`/patient/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0"><div className="relative shrink-0"><div title={isHmo ? "HMO Patient" : "Private Patient"} className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full z-20 ${isHmo ? "bg-amber-500" : "bg-green-500"}`} /><div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)" }}><span className="text-lg font-bold text-white">{(p.full_name || "?")[0]}</span></div></div><div className="flex-1 min-w-0 flex flex-col justify-center"><div className="flex items-center gap-2 flex-wrap"><p className="text-base font-bold truncate">{p.full_name}</p>{p.patient_number && <span className="text-xs font-mono bg-primary/10 text-primary px-2.5 py-1 rounded-lg">{p.patient_number}</span>}</div><div className="flex items-center gap-2 mt-1 flex-wrap"><span className="text-xs text-muted-foreground">{p.gender}</span><span className="text-xs text-muted-foreground">•</span><span className="text-xs text-muted-foreground">{getCurrentPatientAge(p.date_of_birth, p.age)}</span></div><div className="flex items-center gap-2 mt-2"><span className={`text-[11px] px-2 py-1 rounded-full font-medium ${isHmo ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>{isHmo ? (p.hmo_name || "HMO") : "PRIVATE"}</span></div><div className="mt-2"><span className="text-sm text-muted-foreground">{p.phone}</span></div><div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap"><span>Visits: {p.visitSummary.visitCount}</span><span>•</span><span>Last: {p.visitSummary.lastVisit ? new Date(p.visitSummary.lastVisit).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span></div><div className="mt-2">{p.feedbackStatus === "completed" ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700">✓ Feedback Completed</span> : p.feedbackStatus === "pending" ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">● Feedback Pending</span> : p.visitSummary.visitCount > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">○ No Feedback</span> : null}</div></div></Link><div className="flex items-center gap-1 shrink-0">{p.phone && <><a href={`tel:${p.phone}`} className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center hover:bg-green-100 transition-colors" title="Call"><Phone size={14} className="text-success" /></a><a href={`https://wa.me/${normalizeWhatsAppNumber(p.phone)}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center hover:bg-green-100 transition-colors" title="WhatsApp"><MessageCircle size={14} className="text-success" /></a></>}<Link to={`/patient/${p.id}`} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"><ChevronRight size={16} className="text-primary" /></Link></div></div>; })}</div>}
      <Dialog open={followupDialogOpen} onOpenChange={(open) => { if (!updatingFollowup) { setFollowupDialogOpen(open); if (!open) { setSelectedFollowup(null); setFollowupAction(null); setFollowupNotes(""); } } }}><DialogContent className="rounded-3xl"><DialogHeader><DialogTitle>{followupAction === "complete" ? "Complete Follow-up" : "Cancel Follow-up"}</DialogTitle><DialogDescription>{followupAction === "complete" ? "Confirm that this patient follow-up has been resolved." : "Are you sure you want to cancel this patient follow-up?"}</DialogDescription></DialogHeader><div className="space-y-3"><div><p className="text-sm font-semibold">Patient</p><p className="text-sm text-muted-foreground">{selectedFollowup?.patient_name || "—"}</p></div><div><label className="text-sm font-semibold">{followupAction === "complete" ? "Resolution notes" : "Cancellation reason"}</label><Textarea value={followupNotes} onChange={(e) => setFollowupNotes(e.target.value)} placeholder={followupAction === "complete" ? "Describe what was done to resolve the patient's issue..." : "Enter the reason for cancelling this follow-up..."} className="mt-2 min-h-[120px] rounded-xl" /></div></div><DialogFooter className="gap-2"><Button type="button" variant="outline" className="rounded-xl" onClick={() => { if (updatingFollowup) return; setFollowupDialogOpen(false); setSelectedFollowup(null); setFollowupAction(null); setFollowupNotes(""); }} disabled={updatingFollowup}>Cancel</Button><Button type="button" className="rounded-xl" onClick={handleUpdateFollowup} disabled={updatingFollowup || followupNotes.trim().length === 0}>{updatingFollowup ? "Saving..." : followupAction === "complete" ? "Complete Follow-up" : "Cancel Follow-up"}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
