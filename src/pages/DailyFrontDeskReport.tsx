import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, CheckCircle2, FileText, Glasses, Loader2, Mail, RefreshCw, Send, Users, Wallet, MessageSquare, Pill } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type AnyDb = any;

type Report = {
  id: string;
  report_date: string;
  submitted_at: string | null;
  status: "draft" | "submitted";
  opening_cash: number;
  report_notes: string | null;
};

type PatientRow = {
  key: string;
  patient_id: string;
  visit_id: string | null;
  hmo_id: string | null;
  patient_name: string;
  patient_number: string | null;
  patient_type: "private" | "hmo";
  hmo_name: string | null;
  prescription_available: boolean;
  od_sphere: string | null;
  od_cylinder: string | null;
  od_axis: string | null;
  os_sphere: string | null;
  os_cylinder: string | null;
  os_axis: string | null;
  reading_add: string | null;
  lens_type: string | null;
  glasses_prescription_sent: boolean;
  lens_order_required: boolean;
  lens_order_status: string | null;
  lens_order_remarks: string | null;
  hmo_request_status: string | null;
  hmo_request_remarks: string | null;
  medication_name: string | null;
  medication_dispensed: boolean;
  feedback_form_sent: boolean;
  feedback_note: string | null;
  feedback_follow_up: "Not required" | "Pending" | "Completed";
  feedback_follow_up_note: string | null;
  remarks: string | null;
};

type Financials = {
  cash_received: number;
  transfer_received: number;
  card_received: number;
  hmo_received: number;
  total_patient_payments: number;
  walk_in_sales: number;
  total_income: number;
  total_expenses: number;
  daily_balance: number;
};

type Expense = { id: string; description: string; amount: number; payment_method: string; paid_to: string | null; remarks: string | null };

const HMO_REQUEST_STATUSES = ["Not sent", "Sent", "Pending Response", "Response Received", "Approved", "Rejected", "Resubmission Required"];
const LENS_ORDER_STATUSES = ["not_required", "pending", "sent", "ordered", "received", "collected"];
const LENS_LABELS: Record<string, string> = {
  not_required: "Not required",
  pending: "Pending",
  sent: "Sent for order",
  ordered: "Ordered",
  received: "Received",
  collected: "Collected",
};

function todayInLagos() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}
function asArray<T>(data: any): T[] { return !data ? [] : Array.isArray(data) ? data : [data]; }
function money(value: number | null | undefined) { return "₦" + (Number(value) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDate(value: string) { const [y, m, d] = value.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function rx(s: string | null, c: string | null, a: string | null) { if (!s && !c && !a) return "—"; return [s || "Plano", c || null, a ? `×${a}` : null].filter(Boolean).join(" / "); }
function badgeTone(value: string) {
  const v = value.toLowerCase();
  if (["sent", "approved", "response received", "ordered", "received", "collected", "dispensed", "completed"].includes(v)) return "bg-emerald-100 text-emerald-700";
  if (["pending", "pending response", "sent for order", "required"].includes(v)) return "bg-amber-100 text-amber-700";
  if (["rejected", "resubmission required"].includes(v)) return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}
function Status({ value }: { value: string }) { return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${badgeTone(value)}`}>{value}</span>; }

export default function DailyFrontDeskReport() {
  const { effectiveClinicId, clinic } = useClinic();
  const { isAdmin, isReceptionist, isSuperAdmin } = useRole();
  const db = apiClient as AnyDb;
  const canOperate = isReceptionist || isAdmin || isSuperAdmin;

  const [reportDate, setReportDate] = useState(todayInLagos);
  const [report, setReport] = useState<Report | null>(null);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reportNotes, setReportNotes] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [filter, setFilter] = useState("");
  const [mobileRow, setMobileRow] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!effectiveClinicId || !canOperate) return;
    setLoading(true);
    try {
      const opened = await db.rpc("open_daily_front_desk_report", { p_clinic_id: effectiveClinicId, p_report_date: reportDate });
      if (opened.error) throw opened.error;
      const header = asArray<any>(opened.data)[0];
      if (!header) throw new Error("Daily report could not be opened");
      const reportId = header.id || header.report_id;
      if (!reportId) throw new Error("Daily report ID was not returned");

      const dayStart = `${reportDate}T00:00:00+01:00`;
      const next = new Date(`${reportDate}T00:00:00+01:00`); next.setDate(next.getDate() + 1);
      const nextStart = next.toISOString();

      const [patientsRes, itemsRes, visitsRes, followupsRes, financeRes, expensesRes, clinicRes] = await Promise.all([
        db.rpc("get_daily_front_desk_report_data", { p_clinic_id: effectiveClinicId, p_report_date: reportDate }),
        db.from("daily_front_desk_report_items").select("*").eq("report_id", reportId).order("created_at", { ascending: true }),
        db.from("visits").select("id,patient_id,medication,medication_dispensed,sub_od_sphere,sub_od_cyl,sub_od_axis,sub_os_sphere,sub_os_cyl,sub_os_axis,sub_reading_add,lens_type").eq("clinic_id", effectiveClinicId).gte("created_at", dayStart).lt("created_at", nextStart),
        db.from("feedback_followups").select("id,patient_id,visit_id,status,reason,notes,created_at,completed_at").eq("clinic_id", effectiveClinicId).order("created_at", { ascending: false }).limit(500),
        db.rpc("get_daily_front_desk_financials", { p_clinic_id: effectiveClinicId, p_report_date: reportDate }),
        db.from("daily_front_desk_expenses").select("id,description,amount,payment_method,paid_to,remarks").eq("report_id", reportId).order("created_at", { ascending: true }),
        db.from("clinics").select("daily_report_email").eq("id", effectiveClinicId).maybeSingle(),
      ]);
      for (const r of [patientsRes, itemsRes, visitsRes, followupsRes, financeRes, expensesRes, clinicRes]) if (r.error) throw r.error;

      const items = itemsRes.data || [];
      const itemMap = new Map(items.map((x: any) => [`${x.patient_id}:${x.visit_id || ""}`, x]));
      const visitMap = new Map((visitsRes.data || []).map((x: any) => [x.id, x]));
      const followupMap = new Map<string, any>();
      for (const f of followupsRes.data || []) {
        const key = `${f.patient_id}:${f.visit_id || ""}`;
        if (!followupMap.has(key)) followupMap.set(key, f);
      }

      const merged: PatientRow[] = asArray<any>(patientsRes.data).map((p: any) => {
        const key = `${p.patient_id}:${p.visit_id || ""}`;
        const saved = itemMap.get(key);
        const visit = visitMap.get(p.visit_id);
        const follow = followupMap.get(key);
        let feedbackFollowUp: PatientRow["feedback_follow_up"] = "Not required";
        if (follow) feedbackFollowUp = String(follow.status || "").toLowerCase().includes("complete") ? "Completed" : "Pending";
        return {
          key, patient_id: p.patient_id, visit_id: p.visit_id || null, hmo_id: p.hmo_id || null,
          patient_name: p.patient_name || "Unknown patient", patient_number: p.patient_number || null,
          patient_type: p.patient_type === "hmo" ? "hmo" : "private", hmo_name: p.hmo_name || null,
          prescription_available: !!p.prescription_available, od_sphere: p.od_sphere ?? null, od_cylinder: p.od_cylinder ?? null, od_axis: p.od_axis ?? null,
          os_sphere: p.os_sphere ?? null, os_cylinder: p.os_cylinder ?? null, os_axis: p.os_axis ?? null, reading_add: p.reading_add ?? null,
          lens_type: p.lens_type || visit?.lens_type || null, glasses_prescription_sent: saved?.glasses_prescription_sent ?? !!p.glasses_prescription_sent,
          lens_order_required: !!p.lens_order_required, lens_order_status: saved?.lens_order_status ?? (p.lens_order_required ? "pending" : "not_required"), lens_order_remarks: saved?.lens_order_remarks ?? null,
          hmo_request_status: saved?.hmo_claim_status ?? (p.patient_type === "hmo" ? "Not sent" : null), hmo_request_remarks: saved?.hmo_claim_remarks ?? null,
          medication_name: visit?.medication || null, medication_dispensed: !!visit?.medication_dispensed,
          feedback_form_sent: saved?.feedback_form_sent ?? !!p.feedback_form_sent,
          feedback_note: saved?.feedback_note ?? null,
          feedback_follow_up: saved?.feedback_follow_up_status || "Not required",
          feedback_follow_up_note: saved?.feedback_follow_up_note ?? null,
          remarks: saved?.remarks ?? null,
        };
      });
      setReport({ ...header, id: reportId }); setReportNotes(header.report_notes || ""); setPatients(merged);
      setFinancials(asArray<Financials>(financeRes.data)[0] || null); setExpenses((expensesRes.data || []) as Expense[]); setEmail(String(clinicRes.data?.daily_report_email || ""));
    } catch (e: any) {
      console.error(e); toast.error(e?.message || "Failed to load daily report"); setReport(null); setPatients([]); setFinancials(null); setExpenses([]);
    } finally { setLoading(false); }
  }, [canOperate, db, effectiveClinicId, reportDate]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => patients.filter((p) => p.patient_name.toLowerCase().includes(filter.trim().toLowerCase()) || (p.patient_number || "").toLowerCase().includes(filter.trim().toLowerCase())), [patients, filter]);
  const hmo = patients.filter((p) => p.patient_type === "hmo");
  const privatePatients = patients.filter((p) => p.patient_type === "private");
  const hmoPending = hmo.filter((p) => !["Approved", "Response Received"].includes(p.hmo_request_status || "")).length;
  const rxTotal = patients.filter((p) => p.prescription_available).length;
  const rxSent = patients.filter((p) => p.prescription_available && p.glasses_prescription_sent).length;
  const lensOrders = patients.filter((p) => p.lens_order_required).length;
  const meds = patients.filter((p) => p.medication_name);
  const medsDispensed = meds.filter((p) => p.medication_dispensed).length;
  const feedbackSent = patients.filter((p) => p.feedback_form_sent).length;
  const feedbackFollowups = patients.filter((p) => p.feedback_follow_up !== "Not required");
  const feedbackFollowupsPending = feedbackFollowups.filter((p) => p.feedback_follow_up !== "Completed").length;
  const outstanding = patients.filter((p) => (p.patient_type === "hmo" && !["Approved", "Response Received"].includes(p.hmo_request_status || "")) || (p.prescription_available && !p.glasses_prescription_sent) || (p.lens_order_required && ["pending", "sent"].includes(p.lens_order_status || "")) || (p.medication_name && !p.medication_dispensed) || (p.feedback_follow_up === "Required" || p.feedback_follow_up === "Pending")).length;

  function patch(key: string, values: Partial<PatientRow>) { setPatients((rows) => rows.map((r) => r.key === key ? { ...r, ...values } : r)); }

  async function savePatient(row: PatientRow) {
    if (!report || report.status === "submitted") return;
    setSaving(row.key);
    try {
      const { error } = await db.rpc("save_daily_front_desk_report_item", {
        p_report_id: report.id, p_patient_id: row.patient_id, p_visit_id: row.visit_id, p_hmo_id: row.hmo_id,
        p_patient_type: row.patient_type, p_glasses_prescription_sent: row.glasses_prescription_sent,
        p_hmo_claim_status: row.patient_type === "hmo" ? row.hmo_request_status : null, p_hmo_claim_remarks: row.patient_type === "hmo" ? row.hmo_request_remarks : null,
        p_lens_order_required: row.lens_order_required, p_lens_order_status: row.lens_order_required ? row.lens_order_status : "not_required", p_lens_order_remarks: row.lens_order_remarks,
        p_feedback_form_sent: row.feedback_form_sent, p_eye_drop_dispensed: row.medication_dispensed, p_remarks: row.remarks,
      });
      if (error) throw error;
      const followup = await db.rpc("save_daily_front_desk_report_followup", {
        p_report_id: report.id, p_patient_id: row.patient_id, p_visit_id: row.visit_id,
        p_status: row.feedback_follow_up, p_note: row.feedback_follow_up_note,
      });
      if (followup.error) throw followup.error;
      const feedback = await db.rpc("save_daily_front_desk_report_feedback_note", {
        p_report_id: report.id, p_patient_id: row.patient_id, p_visit_id: row.visit_id,
        p_feedback_note: row.feedback_note,
      });
      if (feedback.error) throw feedback.error;
      toast.success(`Saved ${row.patient_name}`);
    } catch (e: any) { toast.error(e?.message || "Failed to save patient entry"); } finally { setSaving(null); }
  }

  async function saveNotes() {
    if (!report || report.status === "submitted") return;
    const { data, error } = await db.rpc("save_daily_front_desk_report", { p_report_id: report.id, p_report_date: report.report_date, p_opening_cash: report.opening_cash || 0, p_report_notes: reportNotes || null });
    if (error) return toast.error(error.message); setReport(asArray<Report>(data)[0] || report); toast.success("Notes saved");
  }

  async function submitReport() {
    if (!report || report.status === "submitted") return;
    setSubmitting(true);
    try {
      const rowsToSave = patients.filter((p) => p.patient_type === "hmo" || p.prescription_available || p.lens_order_required || p.feedback_form_sent || p.remarks || p.medication_name);
      for (const row of rowsToSave) await savePatient(row);
      const { data, error } = await db.rpc("submit_daily_front_desk_report", { p_report_id: report.id });
      if (error) throw error; setReport(asArray<Report>(data)[0] || report); toast.success("Daily report submitted and locked");
    } catch (e: any) { toast.error(e?.message || "Failed to submit report"); } finally { setSubmitting(false); }
  }

  async function sendEmail() {
    if (!report || report.status !== "submitted" || !email) return;
    setSendingEmail(true);
    try { const { data, error } = await apiClient.functions.invoke("send-daily-front-desk-report", { body: { report_id: report.id } }); if (error || data?.error) throw new Error(data?.error || error?.message || "Email failed"); toast.success(`Report sent to ${data?.recipient || email}`); }
    catch (e: any) { toast.error(e?.message || "Failed to send report"); } finally { setSendingEmail(false); }
  }

  if (!canOperate) return <div className="p-6 text-sm text-muted-foreground">This report is available to front-desk and administrative staff.</div>;

  return <div className="min-h-full bg-background"><div className="mx-auto max-w-[1600px] p-3 md:p-6 space-y-4 md:space-y-5">
    <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
      <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Front Desk Operations</div><h1 className="mt-1 text-2xl md:text-3xl font-bold">Daily Front Desk Report</h1><p className="text-sm text-muted-foreground mt-1">{clinic?.name || "Clinic"} · {formatDate(reportDate)}</p></div>
      <div className="flex flex-wrap gap-2"><Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-[180px]" /><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className="mr-1" />Refresh</Button>{report?.status === "submitted" && email && <Button variant="outline" onClick={() => void sendEmail()} disabled={sendingEmail}>{sendingEmail ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Mail size={15} className="mr-1" />}Send Email</Button>}<Button onClick={() => void submitReport()} disabled={!report || report.status === "submitted" || submitting}>{submitting ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Send size={15} className="mr-1" />}Submit Report</Button></div>
    </header>


    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="p-3 md:p-4 border-b flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div><h2 className="font-semibold">Patient Activity — Spreadsheet</h2><p className="text-[11px] text-muted-foreground">Clinical data supplies the final optical Rx; reception completes the operational fields.</p></div>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search patient or number…" className="sm:w-[260px]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1450px] border-collapse text-xs">
          <thead className="bg-primary/10"><tr><Th># / Patient</Th><Th>Type</Th><Th>HMO</Th><Th>HMO Request</Th><Th>Subjective Refraction</Th><Th>Rx Sent</Th><Th>Lens Type</Th><Th>Lens Order</Th><Th>Medication</Th><Th>Dispensed</Th><Th>Feedback</Th><Th>Follow-up</Th><Th>Remarks</Th><Th>Action</Th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={14} className="p-12 text-center"><Loader2 className="animate-spin inline" /></td></tr> : filtered.map((row, index) => <DesktopRow key={row.key} row={row} index={index + 1} editable={canOperate && report?.status !== "submitted"} saving={saving === row.key} patch={patch} save={savePatient} />)}</tbody>
        </table>
      </div>
      {!loading && !filtered.length && <div className="py-10 text-center text-sm text-muted-foreground">No patients match this report.</div>}
    </div>
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="rounded-2xl border bg-card p-4 lg:col-span-2"><div className="flex items-center gap-2 mb-3"><Wallet size={18} className="text-primary" /><h2 className="font-semibold">Daily Financial Summary</h2></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Money label="Total Income" value={financials?.total_income} /><Money label="Total Expenditure" value={financials?.total_expenses} /><Money label="Daily Balance" value={financials?.daily_balance} /><Money label="HMO Received" value={financials?.hmo_received} /></div><div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"><Mini label="Cash" value={financials?.cash_received} /><Mini label="Transfer" value={financials?.transfer_received} /><Mini label="POS / Card" value={financials?.card_received} /><Mini label="Private patient payments" value={financials?.total_patient_payments} /></div></div>
      <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 mb-3"><Banknote size={18} className="text-primary" /><h2 className="font-semibold">Expenditure</h2></div>{expenses.length ? <div className="space-y-2 max-h-44 overflow-auto">{expenses.map((e) => <div key={e.id} className="flex justify-between gap-3 text-sm"><span>{e.description}<span className="block text-xs text-muted-foreground">{e.payment_method}{e.paid_to ? ` · ${e.paid_to}` : ""}</span></span><strong>{money(e.amount)}</strong></div>)}</div> : <p className="text-sm text-muted-foreground">No expenditure recorded.</p>}</div>
    </div>

    <div className="rounded-2xl border bg-card p-4"><Label className="font-semibold">Notes / Additional Information</Label><Textarea className="mt-2 min-h-[100px]" value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} disabled={report?.status === "submitted"} placeholder="Important issues, HMO responses, outstanding tasks, expenses, follow-ups or anything management should know…" /><div className="mt-3 flex justify-end"><Button variant="outline" onClick={() => void saveNotes()} disabled={!report || report.status === "submitted"}>Save Notes</Button></div></div>

    <div className="rounded-2xl border bg-muted/20 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><div className="font-semibold">End of Day</div><div className="text-xs text-muted-foreground">{report?.status === "submitted" ? "Submitted and locked." : outstanding ? `${outstanding} patient tasks still need attention.` : "All tracked patient tasks are complete."}</div></div><div className="flex gap-2"><Button onClick={() => void submitReport()} disabled={!report || report.status === "submitted" || submitting}>{submitting ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Send size={15} className="mr-1" />}Submit Report</Button>{report?.status === "submitted" && email && <Button variant="outline" onClick={() => void sendEmail()} disabled={sendingEmail}>{sendingEmail ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Mail size={15} className="mr-1" />}Send Email Manually</Button>}</div></div>
  </div></div>;
}

function Summary({ icon: Icon, label, value, detail }: any) { return <div className="rounded-2xl border bg-card p-3 shadow-sm"><div className="flex items-center gap-2"><span className="rounded-xl bg-primary/10 p-2"><Icon size={17} className="text-primary" /></span><span className="text-xs font-medium text-muted-foreground">{label}</span></div><div className="mt-2 text-xl font-bold">{value}</div><div className="text-[11px] text-muted-foreground">{detail}</div></div>; }
function Money({ label, value }: { label: string; value?: number | null }) { return <div className="rounded-xl border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-bold">{money(value)}</div></div>; }
function Mini({ label, value }: { label: string; value?: number | null }) { return <div className="rounded-lg bg-muted/30 p-2"><span className="text-muted-foreground">{label}</span><strong className="block mt-1">{money(value)}</strong></div>; }
function Th({ children }: { children: ReactNode }) { return <th className="p-3 text-left font-semibold whitespace-nowrap">{children}</th>; }
function RxCell({ row }: { row: PatientRow }) {
  if (!row.prescription_available) return <span className="text-muted-foreground">—</span>;
  return <div className="leading-5 whitespace-nowrap"><div>OD {rx(row.od_sphere,row.od_cylinder,row.od_axis)}</div><div>OS {rx(row.os_sphere,row.os_cylinder,row.os_axis)}</div>{row.reading_add ? <div>ADD {row.reading_add}</div> : null}</div>;
}
function SelectStatus({ value, options, disabled, onChange }: { value: string; options: string[]; disabled?: boolean; onChange: (v: string) => void }) { return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className="h-8 min-w-[125px] text-xs"><SelectValue /></SelectTrigger><SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{LENS_LABELS[o] || o}</SelectItem>)}</SelectContent></Select>; }

function DesktopRow({ row, index, editable, saving, patch, save }: any) {
  return <tr className="border-t hover:bg-muted/20 align-middle">
    <td className="p-2 md:p-3 font-medium whitespace-nowrap"><span className="text-muted-foreground mr-2">{index}</span>{row.patient_name}<span className="block text-[10px] text-muted-foreground ml-5">{row.patient_number || "No patient number"}</span></td>
    <td className="p-2 md:p-3"><Status value={row.patient_type === "hmo" ? "HMO" : "Private"} /></td>
    <td className="p-2 md:p-3 whitespace-nowrap">{row.hmo_name || "—"}</td>
    <td className="p-2 md:p-3">{row.patient_type === "hmo" ? <SelectStatus value={row.hmo_request_status || "Not sent"} options={HMO_REQUEST_STATUSES} disabled={!editable} onChange={(v) => patch(row.key,{hmo_request_status:v})} /> : "—"}</td>
    <td className="p-2 md:p-3 min-w-[220px]"><RxCell row={row} /></td>
    <td className="p-2 md:p-3"><Status value={row.glasses_prescription_sent ? "Sent" : row.prescription_available ? "Not sent" : "Not required"} /></td>
    <td className="p-2 md:p-3 whitespace-nowrap">{row.lens_type || "—"}</td>
    <td className="p-2 md:p-3">{row.lens_order_required ? <SelectStatus value={row.lens_order_status || "pending"} options={LENS_ORDER_STATUSES} disabled={!editable} onChange={(v) => patch(row.key,{lens_order_status:v})} /> : <Status value="Not required" />}</td>
    <td className="p-2 md:p-3 min-w-[130px]">{row.medication_name || "—"}</td>
    <td className="p-2 md:p-3">{row.medication_name ? <Status value={row.medication_dispensed ? "Dispensed" : "Not dispensed"} /> : "—"}</td>
    <td className="p-2 md:p-3 min-w-[180px]">{editable ? <Input value={row.feedback_note || ""} onChange={(e) => patch(row.key,{feedback_note:e.target.value})} placeholder="Feedback" className="h-8 text-xs" /> : row.feedback_note || "—"}</td>
    <td className="p-2 md:p-3 min-w-[150px]">{editable ? <SelectStatus value={row.feedback_follow_up} options={["Not required","Pending","Completed"]} disabled={!editable} onChange={(v) => patch(row.key,{feedback_follow_up:v})} /> : row.feedback_follow_up === "Not required" ? "—" : <Status value={row.feedback_follow_up} />}</td>
    <td className="p-2 md:p-3 min-w-[180px]">{editable ? <Input value={row.remarks || ""} onChange={(e) => patch(row.key,{remarks:e.target.value})} placeholder="Remarks" className="h-8 text-xs" /> : row.remarks || "—"}</td>
    <td className="p-2 md:p-3"><Button size="sm" onClick={() => void save(row)} disabled={!editable || saving}>{saving ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}Save</Button></td>
  </tr>;
}

function MobileRow({ row, open, setOpen, editable, saving, patch, save }: any) {
  return <div className="p-3"><button type="button" onClick={setOpen} className="w-full text-left"><div className="flex items-center justify-between gap-3"><div><div className="font-semibold text-sm">{row.patient_name}</div><div className="text-[11px] text-muted-foreground">{row.patient_number || "No patient number"} · {row.patient_type === "hmo" ? row.hmo_name || "HMO" : "Private"}</div></div><div className="flex flex-wrap justify-end gap-1"><Status value={row.patient_type === "hmo" ? "HMO" : "Private"} />{row.feedback_follow_up !== "Not required" && <Status value={row.feedback_follow_up} />}</div></div></button>{open && <div className="mt-3 rounded-xl border bg-muted/20 p-3 space-y-3"><div className="grid grid-cols-2 gap-3 text-xs"><Info label="HMO Request" value={row.patient_type === "hmo" ? row.hmo_request_status || "Not sent" : "—"} /><Info label="Lens Type" value={row.lens_type || "—"} /><Info label="Glasses Prescription" value={row.glasses_prescription_sent ? "Sent" : row.prescription_available ? "Not sent" : "Not required"} /><Info label="Feedback" value={row.feedback_form_sent ? "Sent" : "Not sent"} /><Info label="Feedback Follow-up" value={row.feedback_follow_up} /><Info label="Medication" value={row.medication_name ? `${row.medication_name} · ${row.medication_dispensed ? "Dispensed" : "Not dispensed"}` : "—"} /></div>{editable && row.patient_type === "hmo" && <SelectStatus value={row.hmo_request_status || "Not sent"} options={HMO_REQUEST_STATUSES} onChange={(v) => patch(row.key,{hmo_request_status:v})} />}{row.lens_order_required && editable && <SelectStatus value={row.lens_order_status || "pending"} options={LENS_ORDER_STATUSES} onChange={(v) => patch(row.key,{lens_order_status:v})} />}<Textarea value={row.remarks || ""} onChange={(e) => patch(row.key,{remarks:e.target.value})} disabled={!editable} placeholder="Remarks" className="min-h-[70px]" /><Button className="w-full" onClick={() => void save(row)} disabled={!editable || saving}>{saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />}Save Patient Row</Button></div>}</div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>; }
