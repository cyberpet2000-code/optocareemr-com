import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  Glasses,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Users,
  Wallet,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type AnyDb = any;

type DailyReport = {
  id: string;
  clinic_id: string;
  report_date: string;
  submitted_by: string | null;
  status: "draft" | "submitted";
  submitted_at: string | null;
  opening_cash: number;
  report_notes: string | null;
  email_sent_at: string | null;
  email_sent_by: string | null;
};

type PatientRow = {
  key: string;
  visit_id: string | null;
  patient_id: string;
  patient_name: string;
  patient_number: string | null;
  phone: string | null;
  patient_type: "private" | "hmo";
  hmo_id: string | null;
  hmo_name: string | null;
  prescription_available: boolean;
  od_sphere: string | number | null;
  od_cylinder: string | number | null;
  od_axis: string | number | null;
  os_sphere: string | number | null;
  os_cylinder: string | number | null;
  os_axis: string | number | null;
  reading_add: string | number | null;
  lens_type: string | null;
  glasses_prescription_sent: boolean;
  lens_order_required: boolean;
  hmo_claim_status: string | null;
  hmo_claim_remarks: string | null;
  lens_order_status: string | null;
  lens_order_remarks: string | null;
  feedback_form_sent: boolean;
  remarks: string | null;
};

type Financials = {
  cash_received: number;
  transfer_received: number;
  card_received: number;
  hmo_received: number;
  total_patient_payments: number;
  walk_in_sales: number;
  total_inventory_sales: number;
  total_income: number;
  total_expenses: number;
  daily_balance: number;
};

type ActivityRow = {
  id: string;
  activity_type: string;
  description: string;
  quantity: number;
  amount: number;
  payment_method: string | null;
  customer_name: string | null;
  remarks: string | null;
  created_at: string;
};

type ExpenseRow = {
  id: string;
  description: string;
  amount: number;
  payment_method: string;
  paid_to: string | null;
  remarks: string | null;
  created_at: string;
};

type ClaimMeta = { pa_code: string; claim_amount: string; response: string; remarks: string };
type LensMeta = { lab: string; fitted_today: boolean; remarks: string };

const CLAIM_STATUSES = ["Not sent", "Sent", "Awaiting reply", "Replied", "Other"];
const LENS_ORDER_STATUSES = [
  { value: "not_required", label: "Not required" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent to lab" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "collected", label: "Collected" },
];
const ACTIVITY_TYPES = [
  { value: "walk_in_sale", label: "Walk-in sale" },
  { value: "optical_sale", label: "Optical sale" },
  { value: "frame_sale", label: "Frame sale" },
  { value: "lens_sale", label: "Lens sale" },
  { value: "eye_drop_sale", label: "Eye drop sale" },
  { value: "other_sale", label: "Other sale" },
  { value: "lens_order", label: "Lens order" },
  { value: "prescription_sent", label: "Prescription sent" },
  { value: "feedback_sent", label: "Feedback sent" },
  { value: "other", label: "Other activity" },
];
const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "transfer", label: "Transfer" },
  { value: "pos", label: "POS/Card" },
  { value: "other", label: "Other" },
];

const EMPTY_ACTIVITY = {
  activity_type: "walk_in_sale",
  description: "",
  quantity: "1",
  amount: "",
  payment_method: "cash",
  customer_name: "",
  remarks: "",
};
const EMPTY_EXPENSE = { description: "", amount: "", payment_method: "cash", paid_to: "", remarks: "" };

function todayInLagos() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}
function asArray<T>(data: any): T[] {
  return !data ? [] : Array.isArray(data) ? data : [data];
}
function formatMoney(value: number | null | undefined) {
  return "₦" + (Number(value) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
function parseMeta<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}
function encodeMeta(value: object) {
  return JSON.stringify(value);
}
function refraction(s: any, c: any, a: any) {
  if (s === null && c === null && a === null) return "—";
  return [s, c, a ? `×${a}` : null].filter((v) => v !== null && v !== undefined && v !== "").join(" / ") || "—";
}

export default function DailyFrontDeskReport() {
  const { effectiveClinicId, clinic } = useClinic();
  const { isAdmin, isReceptionist, isSuperAdmin } = useRole();
  const db = apiClient as AnyDb;
  const canOperate = isReceptionist || isAdmin || isSuperAdmin;
  const canConfigureEmail = isAdmin || isSuperAdmin;

  const [reportDate, setReportDate] = useState(todayInLagos);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [clinicEmail, setClinicEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [openSection, setOpenSection] = useState<string | null>("patients");
  const [loading, setLoading] = useState(true);
  const [savingPatient, setSavingPatient] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [activitySaving, setActivitySaving] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [activityForm, setActivityForm] = useState({ ...EMPTY_ACTIVITY });
  const [expenseForm, setExpenseForm] = useState({ ...EMPTY_EXPENSE });

  const isSubmitted = report?.status === "submitted";
  const canEdit = canOperate && !isSubmitted;

  const load = useCallback(async () => {
    if (!effectiveClinicId || !canOperate) return;
    setLoading(true);
    try {
      const opened = await db.rpc("open_daily_front_desk_report", { p_clinic_id: effectiveClinicId, p_report_date: reportDate });
      if (opened.error) throw opened.error;
      const header = asArray<DailyReport>(opened.data)[0];
      if (!header) throw new Error("Daily report could not be opened");

      const [patientsRes, itemsRes, activitiesRes, expensesRes, financialsRes, clinicRes] = await Promise.all([
        db.rpc("get_daily_front_desk_report_data", { p_clinic_id: effectiveClinicId, p_report_date: reportDate }),
        db.from("daily_front_desk_report_items").select("*").eq("report_id", header.id).order("created_at", { ascending: true }),
        db.from("daily_front_desk_activities").select("*").eq("report_id", header.id).order("created_at", { ascending: true }),
        db.from("daily_front_desk_expenses").select("*").eq("report_id", header.id).order("created_at", { ascending: true }),
        db.rpc("get_daily_front_desk_financials", { p_clinic_id: effectiveClinicId, p_report_date: reportDate }),
        db.from("clinics").select("id,name,daily_report_email").eq("id", effectiveClinicId).maybeSingle(),
      ]);
      for (const result of [patientsRes, itemsRes, activitiesRes, expensesRes, financialsRes, clinicRes]) if (result.error) throw result.error;

      const savedItems = (itemsRes.data || []) as any[];
      const itemMap = new Map(savedItems.map((item: any) => [`${item.patient_id}:${item.visit_id || ""}`, item]));
      const merged: PatientRow[] = asArray<any>(patientsRes.data).map((p: any) => {
        const saved = itemMap.get(`${p.patient_id}:${p.visit_id || ""}`);
        return {
          key: `${p.patient_id}:${p.visit_id || ""}`,
          visit_id: p.visit_id || null,
          patient_id: p.patient_id,
          patient_name: p.patient_name || "Unknown patient",
          patient_number: p.patient_number || null,
          phone: p.phone || p.phone_number || null,
          patient_type: p.patient_type === "hmo" ? "hmo" : "private",
          hmo_id: p.hmo_id || null,
          hmo_name: p.hmo_name || null,
          prescription_available: !!p.prescription_available,
          od_sphere: p.od_sphere ?? null,
          od_cylinder: p.od_cylinder ?? null,
          od_axis: p.od_axis ?? null,
          os_sphere: p.os_sphere ?? null,
          os_cylinder: p.os_cylinder ?? null,
          os_axis: p.os_axis ?? null,
          reading_add: p.reading_add ?? null,
          lens_type: p.lens_type || null,
          glasses_prescription_sent: saved?.glasses_prescription_sent ?? !!p.glasses_prescription_sent,
          lens_order_required: !!p.lens_order_required,
          hmo_claim_status: saved?.hmo_claim_status ?? (p.patient_type === "hmo" ? "Not sent" : null),
          hmo_claim_remarks: saved?.hmo_claim_remarks ?? null,
          lens_order_status: saved?.lens_order_status ?? (p.lens_order_required ? "pending" : "not_required"),
          lens_order_remarks: saved?.lens_order_remarks ?? null,
          feedback_form_sent: saved?.feedback_form_sent ?? !!p.feedback_form_sent,
          remarks: saved?.remarks ?? null,
        };
      });

      setReport(header);
      setReportNotes(header.report_notes || "");
      setPatients(merged);
      setActivities((activitiesRes.data || []) as ActivityRow[]);
      setExpenses((expensesRes.data || []) as ExpenseRow[]);
      setFinancials(asArray<Financials>(financialsRes.data)[0] || null);
      const configured = String(clinicRes.data?.daily_report_email || "");
      setClinicEmail(configured);
      setEmailDraft(configured);
    } catch (error: any) {
      console.error("Failed to load daily front desk report:", error);
      toast.error(error?.message || "Failed to load daily report");
      setReport(null);
      setPatients([]);
      setActivities([]);
      setExpenses([]);
      setFinancials(null);
    } finally {
      setLoading(false);
    }
  }, [canOperate, db, effectiveClinicId, reportDate]);

  useEffect(() => { void load(); }, [load]);

  const hmoPatients = useMemo(() => patients.filter((p) => p.patient_type === "hmo"), [patients]);
  const privatePatients = useMemo(() => patients.filter((p) => p.patient_type === "private"), [patients]);
  const prescriptionCount = useMemo(() => patients.filter((p) => p.prescription_available).length, [patients]);
  const prescriptionsSent = useMemo(() => patients.filter((p) => p.glasses_prescription_sent).length, [patients]);
  const lensOrders = useMemo(() => patients.filter((p) => p.lens_order_required).length, [patients]);
  const fittedToday = useMemo(() => patients.filter((p) => parseMeta<LensMeta>(p.lens_order_remarks, { lab: "", fitted_today: false, remarks: "" }).fitted_today).length, [patients]);
  const claimsPending = useMemo(() => hmoPatients.filter((p) => (p.hmo_claim_status || "").toLowerCase() !== "replied").length, [hmoPatients]);
  const activityTotal = useMemo(() => activities.reduce((sum, row) => sum + Number(row.amount || 0), 0), [activities]);
  const expenseTotal = useMemo(() => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0), [expenses]);

  function updatePatient(key: string, patch: Partial<PatientRow>) {
    setPatients((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  async function savePatient(row: PatientRow) {
    if (!report || !canEdit) return;
    setSavingPatient(row.key);
    try {
      const { error } = await db.rpc("save_daily_front_desk_report_item", {
        p_report_id: report.id,
        p_patient_id: row.patient_id,
        p_visit_id: row.visit_id,
        p_hmo_id: row.hmo_id,
        p_patient_type: row.patient_type,
        p_glasses_prescription_sent: row.glasses_prescription_sent,
        p_hmo_claim_status: row.patient_type === "hmo" ? row.hmo_claim_status : null,
        p_hmo_claim_remarks: row.patient_type === "hmo" ? row.hmo_claim_remarks : null,
        p_lens_order_required: row.lens_order_required,
        p_lens_order_status: row.lens_order_required ? row.lens_order_status || "pending" : "not_required",
        p_lens_order_remarks: row.lens_order_required ? row.lens_order_remarks : null,
        p_feedback_form_sent: row.feedback_form_sent,
        p_eye_drop_dispensed: false,
        p_remarks: row.remarks,
      });
      if (error) throw error;
      toast.success(`Saved ${row.patient_name}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save patient entry");
    } finally {
      setSavingPatient(null);
    }
  }

  async function saveNotes() {
    if (!report || !canEdit) return;
    setSavingNotes(true);
    try {
      const { data, error } = await db.rpc("save_daily_front_desk_report", {
        p_report_id: report.id,
        p_report_date: report.report_date,
        p_opening_cash: Number(report.opening_cash || 0),
        p_report_notes: reportNotes || null,
      });
      if (error) throw error;
      setReport(asArray<DailyReport>(data)[0] || report);
      toast.success("Report notes saved");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  async function submitReport() {
    if (!report || !canEdit) return;
    if (!window.confirm("Submit this daily report? It will become read-only.")) return;
    setSubmitting(true);
    try {
      const { data, error } = await db.rpc("submit_daily_front_desk_report", { p_report_id: report.id });
      if (error) throw error;
      setReport(asArray<DailyReport>(data)[0] || report);
      toast.success("Daily report submitted and locked");
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRecipientEmail() {
    if (!effectiveClinicId || !canConfigureEmail) return;
    const value = emailDraft.trim().toLowerCase();
    if (value && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await db.from("clinics").update({ daily_report_email: value || null }).eq("id", effectiveClinicId);
      if (error) throw error;
      setClinicEmail(value);
      toast.success("Daily report email saved");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save email");
    } finally {
      setSavingEmail(false);
    }
  }

  async function sendReportEmail() {
    if (!report || report.status !== "submitted") return;
    if (!clinicEmail) {
      toast.error("Ask an Admin to configure the daily report email first");
      return;
    }
    setSendingEmail(true);
    try {
      const { data, error } = await apiClient.functions.invoke("send-daily-front-desk-report", { body: { report_id: report.id } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "Email failed");
      toast.success(`Daily report sent to ${(data as any)?.recipient || clinicEmail}`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to send report");
    } finally {
      setSendingEmail(false);
    }
  }

  async function addActivity() {
    if (!report || !canEdit) return;
    if (!activityForm.description.trim()) return toast.error("Activity description is required");
    const quantity = Number(activityForm.quantity);
    const amount = Number(activityForm.amount || 0);
    if (!Number.isFinite(quantity) || quantity < 1) return toast.error("Quantity must be at least 1");
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Amount cannot be negative");
    setActivitySaving(true);
    try {
      const { error } = await db.rpc("save_daily_front_desk_activity", {
        p_report_id: report.id,
        p_activity_type: activityForm.activity_type,
        p_description: activityForm.description.trim(),
        p_quantity: quantity,
        p_amount: amount,
        p_payment_method: activityForm.payment_method,
        p_customer_name: activityForm.customer_name.trim() || null,
        p_remarks: activityForm.remarks.trim() || null,
      });
      if (error) throw error;
      setActivityForm({ ...EMPTY_ACTIVITY });
      setActivityOpen(false);
      await load();
      toast.success("Activity added");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add activity");
    } finally {
      setActivitySaving(false);
    }
  }

  async function addExpense() {
    if (!report || !canEdit) return;
    if (!expenseForm.description.trim()) return toast.error("Expense description is required");
    const amount = Number(expenseForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a valid expense amount");
    setExpenseSaving(true);
    try {
      const { error } = await db.rpc("save_daily_front_desk_expense", {
        p_report_id: report.id,
        p_description: expenseForm.description.trim(),
        p_amount: amount,
        p_payment_method: expenseForm.payment_method,
        p_paid_to: expenseForm.paid_to.trim() || null,
        p_remarks: expenseForm.remarks.trim() || null,
      });
      if (error) throw error;
      setExpenseForm({ ...EMPTY_EXPENSE });
      setExpenseOpen(false);
      await load();
      toast.success("Expense added");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add expense");
    } finally {
      setExpenseSaving(false);
    }
  }

  function section(id: string) {
    setOpenSection((current) => current === id ? null : id);
  }

  if (!canOperate) {
    return <div className="p-6 text-sm text-muted-foreground">This report is available to front-desk and administrative staff.</div>;
  }

  const summary = [
    { label: "Patients Seen", value: patients.length, detail: \`${privatePatients.length} Private  |  ${hmoPatients.length} HMO\`, icon: Users },
    { label: "Total Income", value: formatMoney(financials?.total_income), detail: \`${formatMoney(financials?.total_patient_payments)} patient payments\`, icon: Wallet },
    { label: "HMO Claims", value: hmoPatients.length, detail: \`${Math.max(0, hmoPatients.length - claimsPending)} Replied  |  ${claimsPending} Pending\`, icon: FileText },
    { label: "Prescriptions", value: prescriptionCount, detail: \`${lensOrders} Orders  |  ${fittedToday} Fitted Today\`, icon: Glasses },
    { label: "Walk-in Sales", value: formatMoney(financials?.walk_in_sales || activityTotal), detail: "Optical shop", icon: CreditCard },
    { label: "Expenses", value: formatMoney(financials?.total_expenses || expenseTotal), detail: \`${expenses.length} items\`, icon: Banknote },
    { label: "Report Status", value: isSubmitted ? "Submitted" : "Not Submitted", detail: isSubmitted ? formatDateTime(report?.submitted_at || null) : "Ready for review", icon: CheckCircle2 },
  ];

  const sections = [
    { id: "patients", title: "Patients Seen Today", subtitle: "All patients seen today — private and HMO", count: \`${patients.length} patients\`, detail: \`${privatePatients.length} Private  |  ${hmoPatients.length} HMO\`, icon: Users },
    { id: "income", title: "Payments & Income (Private)", subtitle: "Payments received from private patients", count: formatMoney(financials?.total_patient_payments), detail: "Auto-calculated from billing", icon: Wallet },
    { id: "claims", title: "HMO & Insurance Claims", subtitle: "Patient claims, PA codes, claim status and HMO response", count: \`${hmoPatients.length} claims\`, detail: \`${Math.max(0, hmoPatients.length - claimsPending)} Replied  |  ${claimsPending} Pending\`, icon: FileText },
    { id: "prescriptions", title: "Prescriptions & Lens Orders", subtitle: "Prescriptions, lens type, lab orders and fittings", count: \`${prescriptionCount} prescriptions\`, detail: \`${lensOrders} Orders  |  ${fittedToday} Fitted Today\`, icon: Glasses },
    { id: "sales", title: "Optical Shop / Walk-in Sales", subtitle: "Sales of frames, lenses and other items", count: formatMoney(financials?.walk_in_sales || activityTotal), detail: "Billing and manual activities", icon: CreditCard },
    { id: "expenses", title: "Expenses & Disbursements", subtitle: "Daily expenses and payments made", count: \`${expenses.length} items\`, detail: formatMoney(financials?.total_expenses || expenseTotal), icon: Banknote },
    { id: "activities", title: "Other Activities", subtitle: "Feedback, follow-ups, calls, restocking and other work", count: \`${activities.length} activities\`, detail: "Front-desk activity log", icon: ClipboardList },
    { id: "claims_followup", title: "Claims", subtitle: "Claim follow-ups requiring attention or external confirmation", count: \`${claimsPending} pending\`, detail: "Review outstanding claims", icon: FileText },
    { id: "remarks", title: "Issues / Remarks", subtitle: "Challenges, important notes or observations", count: reportNotes ? "Notes added" : "No notes", detail: "Management attention", icon: MessageSquare },
    { id: "finish", title: "End of Day Confirmation", subtitle: "Review and submit your report", count: isSubmitted ? "Submitted" : "Not Submitted", detail: isSubmitted ? formatDateTime(report?.submitted_at || null) : "Ready for review", icon: CheckCircle2 },
  ];

  ];

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[1500px] p-4 md:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Front Desk Operations</div>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">Daily Front Desk Report</h1>
            <p className="text-sm text-muted-foreground mt-1">{clinic?.name || "Clinic"} · Patient Activity, Financial Summary & Operational Update</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-[190px]" disabled={loading} />
            <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "mr-1 animate-spin" : "mr-1"} />Refresh</Button>
            {isSubmitted && clinicEmail && (
              <Button variant="outline" onClick={() => void sendReportEmail()} disabled={sendingEmail}>
                {sendingEmail ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Mail size={15} className="mr-1" />}
                Email Report
              </Button>
            )}
            <Button onClick={() => void submitReport()} disabled={!canEdit || submitting}>
              {submitting ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Send size={15} className="mr-1" />}
              Submit Report
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-3">
          {summary.map((item) => {
            const Icon = item.icon;
            return <div key={item.label} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-primary/10 p-2.5"><Icon size={19} className="text-primary" /></div>
                <span className="text-[11px] font-medium text-muted-foreground">{formatDate(reportDate)}</span>
              </div>
              <div className="mt-3 text-xl font-bold">{item.value}</div>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
            </div>;
          })}
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          {sections.map((item, index) => {
            const Icon = item.icon;
            const open = openSection === item.id;
            return <div key={item.id} className={index ? "border-t" : ""}>
              <button type="button" onClick={() => section(item.id)} className={`w-full px-4 md:px-5 py-4 flex items-center gap-3 text-left hover:bg-muted/40 transition ${open ? "bg-muted/20" : ""}`}>
                <span className="shrink-0 rounded-xl bg-primary/10 p-2.5"><Icon size={19} className="text-primary" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm md:text-base">{index + 1}. {item.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">{item.subtitle}</span>
                </span>
                <span className="hidden md:block text-right mr-2 shrink-0">
                  <span className="block text-sm font-semibold">{item.count}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.detail}</span>
                </span>
                <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && <div className="border-t bg-background p-4 md:p-5">{renderSection(item.id)}</div>}
            </div>;
          })}
        </div>
      </div>
    </div>
  );

  function renderSection(id: string) {
    if (id === "patients") {
      if (!patients.length) return <Empty text="No patients were recorded for this date." />;
      return <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm">
        <thead><tr className="border-b text-left text-xs text-muted-foreground">
          <th className="p-2">#</th><th className="p-2">Patient</th><th className="p-2">Clinic ID</th><th className="p-2">Type</th><th className="p-2">HMO</th><th className="p-2">Service / Rx</th><th className="p-2">Prescription</th><th className="p-2">Lens Order</th><th className="p-2">Feedback</th>
        </tr></thead>
        <tbody>{patients.map((row, i) => <tr key={row.key} className="border-b last:border-0">
          <td className="p-2">{i + 1}</td><td className="p-2 font-medium">{row.patient_name}<div className="text-[11px] text-muted-foreground">{row.phone || "No phone"}</div></td><td className="p-2">{row.patient_number || "—"}</td><td className="p-2"><Badge text={row.patient_type === "hmo" ? "HMO" : "Private"} tone={row.patient_type === "hmo" ? "blue" : "gray"} /></td><td className="p-2">{row.hmo_name || "—"}</td><td className="p-2">{row.prescription_available ? "Consultation + Rx" : "Consultation / visit"}</td><td className="p-2"><Badge text={row.glasses_prescription_sent ? "Sent" : row.prescription_available ? "Available" : "—"} tone={row.glasses_prescription_sent ? "green" : "gray"} /></td><td className="p-2"><Badge text={row.lens_order_required ? (row.lens_order_status || "Pending") : "No order"} tone={row.lens_order_required ? "orange" : "gray"} /></td><td className="p-2"><Badge text={row.feedback_form_sent ? "Sent" : "Pending"} tone={row.feedback_form_sent ? "green" : "orange"} /></td>
        </tr>)}</tbody>
      </table></div>;
    }

    if (id === "income") {
      return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MoneyCard label="Cash" value={financials?.cash_received} /><MoneyCard label="Transfer" value={financials?.transfer_received} /><MoneyCard label="POS / Card" value={financials?.card_received} /><MoneyCard label="Total private payments" value={financials?.total_patient_payments} />
      </div>;
    }

    if (id === "claims") {
      return <div className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
          HMO systems are not directly connected to OptoCare. Patient name, clinic ID, phone number, HMO and visit information are pulled automatically. The front desk enters the PA/authorization code, claim status, HMO response and remarks.
        </div>
        {hmoPatients.length === 0 ? <Empty text="No HMO patients for this date." /> : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">#</th><th className="p-3 text-left">Patient Name</th><th className="p-3 text-left">Clinic ID</th><th className="p-3 text-left">Phone Number</th><th className="p-3 text-left">HMO</th><th className="p-3 text-left">Service / Reason</th><th className="p-3 text-left">Claim Amount</th><th className="p-3 text-left">PA Code</th><th className="p-3 text-left">Claim Status</th><th className="p-3 text-left">HMO Response / Remarks</th><th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {hmoPatients.map((row, i) => {
                  const meta = parseMeta<ClaimMeta>(row.hmo_claim_remarks, { pa_code: "", claim_amount: "", response: "", remarks: "" });
                  const setMeta = (patch: Partial<ClaimMeta>) => updatePatient(row.key, { hmo_claim_remarks: encodeMeta({ ...meta, ...patch }) });
                  return <tr key={row.key} className="border-t align-top">
                    <td className="p-3">{i + 1}</td><td className="p-3 font-medium">{row.patient_name}</td><td className="p-3">{row.patient_number || "—"}</td><td className="p-3">{row.phone || "—"}</td><td className="p-3">{row.hmo_name || "—"}</td><td className="p-3">{row.prescription_available ? "Consultation + Rx" : "Routine / Follow-up"}</td>
                    <td className="p-3"><Input type="number" min="0" value={meta.claim_amount} onChange={(e) => setMeta({ claim_amount: e.target.value })} disabled={!canEdit} className="w-[120px]" placeholder="Amount" /></td>
                    <td className="p-3"><Input value={meta.pa_code} onChange={(e) => setMeta({ pa_code: e.target.value })} disabled={!canEdit} className="w-[130px]" placeholder="PA code" /></td>
                    <td className="p-3"><Select value={row.hmo_claim_status || "Not sent"} onValueChange={(v) => updatePatient(row.key, { hmo_claim_status: v })} disabled={!canEdit}><SelectTrigger className="w-[135px]"><SelectValue /></SelectTrigger><SelectContent>{CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></td>
                    <td className="p-3 min-w-[280px]"><Input value={meta.response} onChange={(e) => setMeta({ response: e.target.value })} disabled={!canEdit} placeholder="HMO response" className="mb-2" /><Textarea value={meta.remarks} onChange={(e) => setMeta({ remarks: e.target.value })} disabled={!canEdit} placeholder="Remarks" className="min-h-[70px]" /></td>
                    <td className="p-3"><Button size="sm" onClick={() => void savePatient(row)} disabled={!canEdit || savingPatient === row.key}>{savingPatient === row.key ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />}Save</Button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>;
    }

    if (id === "prescriptions") {
      const rows = patients.filter((p) => p.prescription_available || p.lens_order_required);
      if (!rows.length) return <Empty text="No prescriptions or lens orders for this date." />;
      return <div className="space-y-3">{rows.map((row) => <LensEditor key={row.key} row={row} canEdit={canEdit} saving={savingPatient === row.key} updatePatient={updatePatient} savePatient={savePatient} />)}</div>;
    }

    if (id === "sales") {
      return <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3"><MoneyCard label="Walk-in sales" value={financials?.walk_in_sales || activityTotal} /><MoneyCard label="Inventory sales" value={financials?.total_inventory_sales} /><MoneyCard label="Total income" value={financials?.total_income} /></div>
        <div className="flex justify-end"><Button size="sm" onClick={() => setActivityOpen(true)} disabled={!canEdit}><Plus size={15} className="mr-1" /> Add sale / activity</Button></div>
        <ActivityList rows={activities} />
      </div>;
    }

    if (id === "expenses") {
      return <div className="space-y-4"><div className="flex justify-end"><Button size="sm" onClick={() => setExpenseOpen(true)} disabled={!canEdit}><Plus size={15} className="mr-1" /> Add expense</Button></div><ExpenseTable rows={expenses} total={financials?.total_expenses || expenseTotal} /></div>;
    }

    if (id === "activities") {
      return <div className="space-y-4"><div className="flex justify-end"><Button size="sm" onClick={() => setActivityOpen(true)} disabled={!canEdit}><Plus size={15} className="mr-1" /> Add activity</Button></div><ActivityList rows={activities} /></div>;
    }

    if (id === "claims_followup") {
      const pending = hmoPatients.filter((p) => (p.hmo_claim_status || "Not sent").toLowerCase() !== "replied");
      if (!pending.length) return <Empty text="No outstanding claim follow-ups." />;
      return <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="p-3 text-left">#</th><th className="p-3 text-left">Patient</th><th className="p-3 text-left">HMO</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">PA Code</th><th className="p-3 text-left">Follow-up / Remarks</th></tr></thead>
          <tbody>{pending.map((row, i) => {
            const meta = parseMeta<ClaimMeta>(row.hmo_claim_remarks, { pa_code: "", claim_amount: "", response: "", remarks: "" });
            return <tr key={row.key} className="border-t"><td className="p-3">{i + 1}</td><td className="p-3 font-medium">{row.patient_name}<div className="text-xs text-muted-foreground">{row.patient_number || "—"}</div></td><td className="p-3">{row.hmo_name || "—"}</td><td className="p-3"><Badge text={row.hmo_claim_status || "Not sent"} tone="orange" /></td><td className="p-3">{meta.pa_code || "—"}</td><td className="p-3">{meta.response || meta.remarks || "Awaiting external HMO action"}</td></tr>;
          })}</tbody>
        </table>
      </div>;
    }

    if (id === "remarks") {
      return <div><Label>Issues / Remarks</Label><Textarea value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} disabled={!canEdit} placeholder="Record issues, HMO follow-ups, patient requests, stock concerns or anything management should know." className="mt-2 min-h-[160px]" /><div className="flex justify-end mt-3"><Button variant="outline" onClick={() => void saveNotes()} disabled={!canEdit || savingNotes}>{savingNotes ? <Loader2 size={15} className="mr-1 animate-spin" /> : <MessageSquare size={15} className="mr-1" />} Save remarks</Button></div></div>;
    }

    if (id === "finish") {
      return <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4"><div className="text-sm font-semibold">Report status</div><div className="mt-2"><Badge text={isSubmitted ? "Submitted & Locked" : "Draft"} tone={isSubmitted ? "green" : "orange"} /></div><div className="mt-3 text-xs text-muted-foreground">{isSubmitted ? `Submitted ${formatDateTime(report?.submitted_at || null)}` : "Review each section before submitting."}</div></div>
        <div className="rounded-xl border p-4"><div className="text-sm font-semibold">Daily balance</div><div className="mt-2 text-2xl font-bold">{formatMoney(financials?.daily_balance)}</div><div className="text-xs text-muted-foreground mt-1">Income less recorded expenses</div></div>
        {!isSubmitted && <div className="md:col-span-2 flex justify-end"><Button onClick={() => void submitReport()} disabled={submitting}>{submitting ? <Loader2 size={15} className="mr-1 animate-spin" /> : <CheckCircle2 size={15} className="mr-1" />} Submit & Lock Report</Button></div>}
        {isSubmitted && clinicEmail && <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-xl bg-muted/30 p-4"><div><div className="font-medium text-sm">Email recipient</div><div className="text-xs text-muted-foreground">{clinicEmail}</div></div><Button variant="outline" onClick={() => void sendReportEmail()} disabled={sendingEmail}>{sendingEmail ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Mail size={15} className="mr-1" />} Send Report</Button></div>}
        {canConfigureEmail && <div className="md:col-span-2 rounded-xl border p-4"><Label>Daily report email (Admin)</Label><div className="mt-2 flex gap-2"><Input value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="manager@clinic.com" /><Button variant="outline" onClick={() => void saveRecipientEmail()} disabled={savingEmail}>{savingEmail ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Mail size={15} className="mr-1" />} Save recipient</Button></div></div>}
      </div>;
    }
    return null;
  }

  function ClaimEditor({ row, canEdit: editable, saving, updatePatient: update, savePatient: save }: { row: PatientRow; canEdit: boolean; saving: boolean; updatePatient: (key: string, patch: Partial<PatientRow>) => void; savePatient: (row: PatientRow) => Promise<void> }) {
    const meta = parseMeta<ClaimMeta>(row.hmo_claim_remarks, { pa_code: "", claim_amount: "", response: "", remarks: "" });
    const setMeta = (patch: Partial<ClaimMeta>) => update(row.key, { hmo_claim_remarks: encodeMeta({ ...meta, ...patch }) });
    return <div className="rounded-xl border p-4 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
        <Info label="Patient" value={row.patient_name} /><Info label="Clinic ID" value={row.patient_number || "—"} /><Info label="Phone" value={row.phone || "—"} /><Info label="HMO" value={row.hmo_name || "—"} /><Info label="Service" value={row.prescription_available ? "Consultation + Rx" : "Eye visit"} /><Info label="Claim amount" value={meta.claim_amount ? formatMoney(Number(meta.claim_amount)) : "Not entered"} />
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Field label="PA / Authorization code"><Input value={meta.pa_code} onChange={(e) => setMeta({ pa_code: e.target.value })} disabled={!editable} placeholder="Enter PA code" /></Field>
        <Field label="Claim amount (₦)"><Input type="number" min="0" value={meta.claim_amount} onChange={(e) => setMeta({ claim_amount: e.target.value })} disabled={!editable} placeholder="Amount claimed" /></Field>
        <Field label="Claim status"><Select value={row.hmo_claim_status || "Not sent"} onValueChange={(v) => update(row.key, { hmo_claim_status: v })} disabled={!editable}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="HMO response"><Input value={meta.response} onChange={(e) => setMeta({ response: e.target.value })} disabled={!editable} placeholder="e.g. Approved / rejected" /></Field>
      </div>
      <Field label="Claim remarks"><Textarea value={meta.remarks} onChange={(e) => setMeta({ remarks: e.target.value })} disabled={!editable} placeholder="Record authorization issues, HMO reply, follow-up or other claim remarks." className="min-h-[80px]" /></Field>
      <div className="flex justify-end"><Button size="sm" onClick={() => void save(row)} disabled={!editable || saving}>{saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />} Save claim</Button></div>
    </div>;
  }

  function LensEditor({ row, canEdit: editable, saving, updatePatient: update, savePatient: save }: { row: PatientRow; canEdit: boolean; saving: boolean; updatePatient: (key: string, patch: Partial<PatientRow>) => void; savePatient: (row: PatientRow) => Promise<void> }) {
    const meta = parseMeta<LensMeta>(row.lens_order_remarks, { lab: "", fitted_today: false, remarks: "" });
    const setMeta = (patch: Partial<LensMeta>) => update(row.key, { lens_order_remarks: encodeMeta({ ...meta, ...patch }) });
    return <div className="rounded-xl border p-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div><div className="font-semibold">{row.patient_name}</div><div className="text-xs text-muted-foreground">{row.patient_number || "No clinic ID"} · {row.phone || "No phone"}</div></div>
        <Badge text={row.lens_order_required ? (row.lens_order_status || "Pending") : "Prescription only"} tone={row.lens_order_required ? "orange" : "blue"} />
      </div>
      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="rounded-lg bg-muted/30 p-3"><div className="text-xs font-medium">Prescription</div><div className="mt-2 text-sm">OD: {refraction(row.od_sphere, row.od_cylinder, row.od_axis)}</div><div className="text-sm">OS: {refraction(row.os_sphere, row.os_cylinder, row.os_axis)}</div><div className="text-sm">ADD: {row.reading_add || "—"}</div><div className="mt-2 text-xs text-muted-foreground">Lens type: {row.lens_type || "Not specified"}</div></div>
        <div className="grid gap-3">
          <Field label="Lens order status"><Select value={row.lens_order_status || "pending"} onValueChange={(v) => update(row.key, { lens_order_status: v })} disabled={!editable || !row.lens_order_required}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LENS_ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Laboratory"><Input value={meta.lab} onChange={(e) => setMeta({ lab: e.target.value })} disabled={!editable} placeholder="Lab / glazing centre" /></Field>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.glasses_prescription_sent} onChange={(e) => update(row.key, { glasses_prescription_sent: e.target.checked })} disabled={!editable} /> Prescription sent to lab</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={meta.fitted_today} onChange={(e) => setMeta({ fitted_today: e.target.checked })} disabled={!editable} /> Lens fitted today at lab</label>
      </div>
      <div className="mt-3"><Field label="Lens order remarks"><Textarea value={meta.remarks} onChange={(e) => setMeta({ remarks: e.target.value })} disabled={!editable} placeholder="Order details, lab response, fitting notes..." /></Field></div>
      <div className="flex justify-end mt-3"><Button size="sm" onClick={() => void save(row)} disabled={!editable || saving}>{saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />} Save lens record</Button></div>
    </div>;
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-medium truncate">{value}</div></div>;
}
function Badge({ text, tone }: { text: string; tone: "green" | "orange" | "blue" | "gray" }) {
  const cls = { green: "bg-green-100 text-green-700", orange: "bg-orange-100 text-orange-700", blue: "bg-blue-100 text-blue-700", gray: "bg-muted text-muted-foreground" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${cls}`}>{text}</span>;
}
function MoneyCard({ label, value }: { label: string; value: number | undefined | null }) {
  return <div className="rounded-xl border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-bold">{formatMoney(value)}</div></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}
function ActivityList({ rows }: { rows: ActivityRow[] }) {
  if (!rows.length) return <Empty text="No activities recorded." />;
  return <div className="divide-y rounded-xl border">{rows.map((row) => <div key={row.id} className="p-3 flex items-start justify-between gap-4"><div><div className="font-medium text-sm">{row.description}</div><div className="text-xs text-muted-foreground mt-1">{row.customer_name || "No customer"} · Qty {row.quantity} · {row.payment_method || "—"}</div>{row.remarks && <div className="text-xs text-muted-foreground mt-1">{row.remarks}</div>}</div><div className="font-semibold text-sm">{formatMoney(row.amount)}</div></div>)}</div>;
}
function ExpenseTable({ rows, total }: { rows: ExpenseRow[]; total: number }) {
  return <div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[650px] text-sm"><thead className="text-xs text-muted-foreground bg-muted/30"><tr><th className="p-3 text-left">Expense</th><th className="p-3 text-left">Paid to</th><th className="p-3 text-left">Method</th><th className="p-3 text-right">Amount</th><th className="p-3 text-left">Remarks</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.description}</td><td className="p-3">{row.paid_to || "—"}</td><td className="p-3 capitalize">{row.payment_method}</td><td className="p-3 text-right font-medium">{formatMoney(row.amount)}</td><td className="p-3 text-muted-foreground">{row.remarks || "—"}</td></tr>)}</tbody></table>{!rows.length && <Empty text="No expenses recorded." />}</div><div className="text-right mt-3 font-semibold">Total expenses: {formatMoney(total)}</div></div>;
}
