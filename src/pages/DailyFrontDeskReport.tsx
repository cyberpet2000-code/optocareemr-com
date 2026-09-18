import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Glasses,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Send,
  Wallet,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
  eye_drop_quantity: number;
  eye_drop_dispensed: boolean;
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
  total_expenses_cash: number;
  total_expenses_transfer: number;
  total_expenses_card: number;
  total_expenses_other: number;
  daily_balance: number;
  eye_drop_items_dispensed: number;
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

const CLAIM_STATUSES = [
  "Not sent",
  "Sent",
  "Awaiting reply",
  "Replied",
  "Other",
];

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

function todayInLagos() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Africa/Lagos",
  });
}

function formatMoney(value: number | null | undefined) {
  return "₦" + (Number(value) || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRefraction(
  sphere: string | number | null,
  cylinder: string | number | null,
  axis: string | number | null,
) {
  const parts: string[] = [];
  if (sphere !== null && sphere !== undefined && sphere !== "") {
    parts.push(String(sphere));
  }
  if (cylinder !== null && cylinder !== undefined && cylinder !== "") {
    parts.push(String(cylinder));
  }
  if (axis !== null && axis !== undefined && axis !== "") {
    parts.push(`×${axis}`);
  }
  return parts.length ? parts.join(" / ") : "—";
}

function asArray<T>(data: any): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function statusBadge(value: string | null | undefined) {
  return value ? value : "Not set";
}

const EMPTY_ACTIVITY = {
  activity_type: "walk_in_sale",
  description: "",
  quantity: "1",
  amount: "",
  payment_method: "cash",
  patient_id: "",
  customer_name: "",
  remarks: "",
};

const EMPTY_EXPENSE = {
  description: "",
  amount: "",
  payment_method: "cash",
  paid_to: "",
  remarks: "",
};

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

  const [loading, setLoading] = useState(true);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingPatient, setSavingPatient] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [activityOpen, setActivityOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [activitySaving, setActivitySaving] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [activityForm, setActivityForm] = useState({ ...EMPTY_ACTIVITY });
  const [expenseForm, setExpenseForm] = useState({ ...EMPTY_EXPENSE });

  const [reportNotes, setReportNotes] = useState("");

  const isSubmitted = report?.status === "submitted";
  const canEdit = canOperate && !isSubmitted;

  const load = useCallback(async () => {
    if (!effectiveClinicId || !reportDate || !canOperate) return;

    setLoading(true);
    try {
      const opened = await db.rpc("open_daily_front_desk_report", {
        p_clinic_id: effectiveClinicId,
        p_report_date: reportDate,
      });
      if (opened.error) throw opened.error;

      const header = asArray<DailyReport>(opened.data)[0];
      if (!header) throw new Error("Daily report could not be opened");

      const [
        patientsRes,
        itemsRes,
        activitiesRes,
        expensesRes,
        financialsRes,
        clinicRes,
      ] = await Promise.all([
        db.rpc("get_daily_front_desk_report_data", {
          p_clinic_id: effectiveClinicId,
          p_report_date: reportDate,
        }),
        db
          .from("daily_front_desk_report_items")
          .select("*")
          .eq("report_id", header.id)
          .order("created_at", { ascending: true }),
        db
          .from("daily_front_desk_activities")
          .select("*")
          .eq("report_id", header.id)
          .order("created_at", { ascending: true }),
        db
          .from("daily_front_desk_expenses")
          .select("*")
          .eq("report_id", header.id)
          .order("created_at", { ascending: true }),
        db.rpc("get_daily_front_desk_financials", {
          p_clinic_id: effectiveClinicId,
          p_report_date: reportDate,
        }),
        db
          .from("clinics")
          .select("id,name,daily_report_email")
          .eq("id", effectiveClinicId)
          .maybeSingle(),
      ]);

      if (patientsRes.error) throw patientsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (financialsRes.error) throw financialsRes.error;
      if (clinicRes.error) throw clinicRes.error;

      const savedItems = (itemsRes.data || []) as any[];
      const itemMap = new Map<string, any>(
        savedItems.map((item: any) => [
          `${item.patient_id}:${item.visit_id || ""}`,
          item,
        ]),
      );

      const basePatients = asArray<any>(patientsRes.data);
      const mergedPatients: PatientRow[] = basePatients.map((p: any) => {
        const key = `${p.patient_id}:${p.visit_id || ""}`;
        const saved = itemMap.get(key);

        return {
          key,
          visit_id: p.visit_id || null,
          patient_id: p.patient_id,
          patient_name: p.patient_name || "Unknown patient",
          patient_number: p.patient_number || null,
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
          glasses_prescription_sent:
            saved?.glasses_prescription_sent ??
            !!p.glasses_prescription_sent,
          lens_order_required: !!p.lens_order_required,
          hmo_claim_status:
            saved?.hmo_claim_status ??
            (p.patient_type === "hmo" ? "Not sent" : null),
          hmo_claim_remarks: saved?.hmo_claim_remarks ?? null,
          lens_order_status:
            saved?.lens_order_status ??
            (p.lens_order_required ? "pending" : "not_required"),
          lens_order_remarks: saved?.lens_order_remarks ?? null,
          eye_drop_quantity: Number(p.eye_drop_quantity || 0),
          eye_drop_dispensed:
            Number(p.eye_drop_quantity || 0) > 0 ||
            !!p.eye_drop_dispensed,
          feedback_form_sent:
            saved?.feedback_form_sent ?? !!p.feedback_form_sent,
          remarks: saved?.remarks ?? null,
        };
      });

      setReport(header);
      setReportNotes(header.report_notes || "");
      setPatients(mergedPatients);
      setActivities((activitiesRes.data || []) as ActivityRow[]);
      setExpenses((expensesRes.data || []) as ExpenseRow[]);

      const finance = asArray<Financials>(financialsRes.data)[0] || null;
      setFinancials(finance);

      const configuredEmail = String(clinicRes.data?.daily_report_email || "");
      setClinicEmail(configuredEmail);
      setEmailDraft(configuredEmail);
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

  useEffect(() => {
    void load();
  }, [load]);

  const reportDateLabel = useMemo(() => formatDate(reportDate), [reportDate]);
  const activityTotal = useMemo(
    () => activities.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [activities],
  );
  const expenseTotal = useMemo(
    () => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [expenses],
  );
  const hmoPatients = useMemo(
    () => patients.filter((p) => p.patient_type === "hmo").length,
    [patients],
  );
  const prescriptionCount = useMemo(
    () => patients.filter((p) => p.prescription_available).length,
    [patients],
  );
  const prescriptionsSent = useMemo(
    () => patients.filter((p) => p.glasses_prescription_sent).length,
    [patients],
  );

  function updatePatient(key: string, patch: Partial<PatientRow>) {
    setPatients((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function savePatient(row: PatientRow) {
    if (!report || !effectiveClinicId || !canEdit) return;
    setSavingPatient(row.key);

    try {
      const { error } = await db.rpc("save_daily_front_desk_report_item", {
        p_report_id: report.id,
        p_patient_id: row.patient_id,
        p_visit_id: row.visit_id,
        p_hmo_id: row.hmo_id,
        p_patient_type: row.patient_type,
        p_glasses_prescription_sent: row.glasses_prescription_sent,
        p_hmo_claim_status:
          row.patient_type === "hmo" ? row.hmo_claim_status : null,
        p_hmo_claim_remarks:
          row.patient_type === "hmo" ? row.hmo_claim_remarks : null,
        p_lens_order_required: row.lens_order_required,
        p_lens_order_status: row.lens_order_required
          ? row.lens_order_status || "pending"
          : "not_required",
        p_lens_order_remarks: row.lens_order_required
          ? row.lens_order_remarks
          : null,
        p_feedback_form_sent: row.feedback_form_sent,
        p_eye_drop_dispensed: row.eye_drop_quantity > 0,
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
    if (!report || !effectiveClinicId || !canEdit) return;
    setSavingHeader(true);
    try {
      const { data, error } = await db.rpc("save_daily_front_desk_report", {
        p_report_id: report.id,
        p_report_date: report.report_date,
        p_opening_cash: Number(report.opening_cash || 0),
        p_report_notes: reportNotes || null,
      });
      if (error) throw error;
      const updated = asArray<DailyReport>(data)[0] || report;
      setReport(updated);
      setReportNotes(updated.report_notes || "");
      toast.success("Daily report notes saved");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save report notes");
    } finally {
      setSavingHeader(false);
    }
  }

  async function submitReport() {
    if (!report || !canEdit) return;
    if (!window.confirm("Submit this daily report? You will not be able to edit it afterwards.")) {
      return;
    }

    setSavingHeader(true);
    try {
      const { data, error } = await db.rpc(
        "submit_daily_front_desk_report",
        { p_report_id: report.id },
      );
      if (error) throw error;
      const updated = asArray<DailyReport>(data)[0] || report;
      setReport(updated);
      toast.success("Daily report submitted and locked");
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit daily report");
    } finally {
      setSavingHeader(false);
    }
  }

  async function saveRecipientEmail() {
    if (!effectiveClinicId || !canConfigureEmail) return;

    const value = emailDraft.trim().toLowerCase();
    if (value && !validEmail(value)) {
      toast.error("Enter a valid email address");
      return;
    }

    setSavingEmail(true);
    try {
      const { error } = await db
        .from("clinics")
        .update({ daily_report_email: value || null })
        .eq("id", effectiveClinicId);
      if (error) throw error;
      setClinicEmail(value);
      setEmailDraft(value);
      toast.success(value ? "Daily report email saved" : "Daily report email cleared");
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
      const { data, error } = await apiClient.functions.invoke(
        "send-daily-front-desk-report",
        { body: { report_id: report.id } },
      );
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Email failed");
      }

      toast.success(
        (data as any)?.recipient
          ? `Daily report sent to ${(data as any).recipient}`
          : "Daily report sent",
      );
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to send daily report");
    } finally {
      setSendingEmail(false);
    }
  }

  async function addActivity() {
    if (!report || !canEdit) return;
    if (!activityForm.description.trim()) {
      toast.error("Activity description is required");
      return;
    }

    const quantity = Number(activityForm.quantity);
    const amount = Number(activityForm.amount || 0);
    if (!Number.isFinite(quantity) || quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Amount cannot be negative");
      return;
    }

    setActivitySaving(true);
    try {
      const { data, error } = await db.rpc(
        "save_daily_front_desk_activity",
        {
          p_report_id: report.id,
          p_activity_type: activityForm.activity_type,
          p_description: activityForm.description.trim(),
          p_quantity: quantity,
          p_amount: amount,
          p_payment_method: activityForm.payment_method || null,
          p_patient_id: activityForm.patient_id || null,
          p_customer_name: activityForm.customer_name.trim() || null,
          p_remarks: activityForm.remarks.trim() || null,
        },
      );
      if (error) throw error;

      const activity = asArray<ActivityRow>(data)[0];
      if (activity) setActivities((rows) => [...rows, activity]);
      setActivityOpen(false);
      setActivityForm({ ...EMPTY_ACTIVITY });
      toast.success("Activity added to report");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to add activity");
    } finally {
      setActivitySaving(false);
    }
  }

  async function addExpense() {
    if (!report || !canEdit) return;
    if (!expenseForm.description.trim()) {
      toast.error("Expense description is required");
      return;
    }

    const amount = Number(expenseForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid expense amount");
      return;
    }

    setExpenseSaving(true);
    try {
      const { data, error } = await db.rpc("save_daily_front_desk_expense", {
        p_report_id: report.id,
        p_description: expenseForm.description.trim(),
        p_amount: amount,
        p_payment_method: expenseForm.payment_method,
        p_paid_to: expenseForm.paid_to.trim() || null,
        p_remarks: expenseForm.remarks.trim() || null,
      });
      if (error) throw error;

      const expense = asArray<ExpenseRow>(data)[0];
      if (expense) setExpenses((rows) => [...rows, expense]);
      setExpenseOpen(false);
      setExpenseForm({ ...EMPTY_EXPENSE });
      toast.success("Expense added to report");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to add expense");
    } finally {
      setExpenseSaving(false);
    }
  }

  if (!canOperate) {
    return (
      <div className="form-section py-12 text-center">
        <h1 className="text-lg font-semibold">Daily Front Desk Report</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This report is available to front-desk staff and clinic administrators.
        </p>
      </div>
    );
  }

  if (loading && !report) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Daily Front Desk Report</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {clinic?.name || "Active clinic"} · {reportDateLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={reportDate}
            max={todayInLagos()}
            onChange={(e) => setReportDate(e.target.value)}
            className="w-[160px]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "mr-1 animate-spin" : "mr-1"} />
            Refresh
          </Button>
          <span
            className={
              isSubmitted
                ? "text-xs px-2.5 py-1 rounded-full bg-success/10 text-success"
                : "text-xs px-2.5 py-1 rounded-full bg-warning/10 text-warning"
            }
          >
            {isSubmitted ? "Submitted" : "Draft"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <div className="form-section">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Mail size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">Report Email</h2>
              <p className="text-xs text-muted-foreground mt-1">
                The receptionist clicks <strong>Send Report to Admin</strong> after submission.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              value={emailDraft}
              disabled={!canConfigureEmail}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="admin@clinic.com"
              className="sm:max-w-md"
            />
            {canConfigureEmail && (
              <Button
                variant="outline"
                onClick={() => void saveRecipientEmail()}
                disabled={savingEmail || emailDraft.trim().toLowerCase() === clinicEmail}
              >
                {savingEmail ? (
                  <Loader2 size={15} className="mr-1 animate-spin" />
                ) : (
                  <Save size={15} className="mr-1" />
                )}
                Save email
              </Button>
            )}
          </div>

          {!clinicEmail ? (
            <p className="mt-2 text-xs text-warning">
              No recipient is configured yet. An Admin must enter the recipient email.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Reports will be sent to <strong>{clinicEmail}</strong>.
            </p>
          )}
        </div>

        <div className="form-section min-w-[280px]">
          <div className="text-xs text-muted-foreground">Email status</div>
          <div className="mt-2 flex items-center gap-2">
            {report?.email_sent_at ? (
              <>
                <CheckCircle2 size={17} className="text-success" />
                <div>
                  <div className="text-sm font-medium">Sent</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(report.email_sent_at)}
                  </div>
                </div>
              </>
            ) : (
              <>
                <Mail size={17} className="text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Not emailed</div>
                  <div className="text-xs text-muted-foreground">
                    Submit the report before emailing it.
                  </div>
                </div>
              </>
            )}
          </div>

          <Button
            className="w-full mt-4"
            onClick={() => void sendReportEmail()}
            disabled={
              sendingEmail ||
              !isSubmitted ||
              !clinicEmail
            }
          >
            {sendingEmail ? (
              <Loader2 size={16} className="mr-1 animate-spin" />
            ) : report?.email_sent_at ? (
              <RefreshCw size={16} className="mr-1" />
            ) : (
              <Send size={16} className="mr-1" />
            )}
            {sendingEmail
              ? "Sending..."
              : report?.email_sent_at
                ? "Resend Report to Admin"
                : "Send Report to Admin"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">Patients</div>
          <div className="text-xl font-bold mt-1">{patients.length}</div>
        </div>
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">HMO</div>
          <div className="text-xl font-bold mt-1">{hmoPatients}</div>
        </div>
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">Rx available</div>
          <div className="text-xl font-bold mt-1">{prescriptionCount}</div>
        </div>
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">Rx sent</div>
          <div className="text-xl font-bold mt-1">{prescriptionsSent}</div>
        </div>
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">Eye drops</div>
          <div className="text-xl font-bold mt-1">{financials?.eye_drop_items_dispensed || 0}</div>
        </div>
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">Patient payments</div>
          <div className="text-sm font-bold mt-1">{formatMoney(financials?.total_patient_payments)}</div>
        </div>
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">Walk-in sales</div>
          <div className="text-sm font-bold mt-1">{formatMoney(financials?.walk_in_sales)}</div>
        </div>
        <div className="form-section p-3">
          <div className="text-[11px] text-muted-foreground">Daily balance</div>
          <div className="text-sm font-bold mt-1">{formatMoney(financials?.daily_balance)}</div>
        </div>
      </div>

      <div className="form-section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              Patient-by-Patient Operations
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Front-desk details only. Final optical prescription is read-only from the completed visit.
            </p>
          </div>
          {loading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
        </div>

        <div className="mt-4 space-y-3">
          {patients.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ClipboardList className="mx-auto h-8 w-8 opacity-40" />
              <p className="mt-2 text-sm">No completed patient visits found for this date.</p>
            </div>
          ) : (
            patients.map((row) => (
              <div key={row.key} className="rounded-xl border border-border/60 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{row.patient_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {row.patient_number || "No patient number"} ·{" "}
                      <span className="capitalize">{row.patient_type}</span>
                      {row.patient_type === "hmo" && row.hmo_name ? ` · ${row.hmo_name}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.eye_drop_quantity > 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1">
                        <Droplets size={11} /> {row.eye_drop_quantity} eye drop item{row.eye_drop_quantity === 1 ? "" : "s"} dispensed
                      </span>
                    )}
                    {row.lens_order_required && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-muted inline-flex items-center gap-1">
                        <Glasses size={11} /> Lens order
                      </span>
                    )}
                  </div>
                </div>

                {row.prescription_available && (
                  <div className="rounded-lg bg-muted/40 border p-3">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Final optical prescription
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">OD</span>{" "}
                        <span className="font-medium">
                          {formatRefraction(row.od_sphere, row.od_cylinder, row.od_axis)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OS</span>{" "}
                        <span className="font-medium">
                          {formatRefraction(row.os_sphere, row.os_cylinder, row.os_axis)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ADD</span>{" "}
                        <span className="font-medium">{row.reading_add ?? "—"}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Lens type:</span>{" "}
                      <span className="font-medium">{row.lens_type || "Not specified"}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {row.patient_type === "hmo" && (
                    <div>
                      <Label className="text-xs">HMO claim status</Label>
                      <Select
                        value={row.hmo_claim_status || "Not sent"}
                        onValueChange={(value) =>
                          updatePatient(row.key, { hmo_claim_status: value })
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLAIM_STATUSES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Prescription sent</Label>
                    <Button
                      type="button"
                      variant={row.glasses_prescription_sent ? "default" : "outline"}
                      className="w-full mt-1 h-9"
                      disabled={!canEdit || !row.prescription_available}
                      onClick={() =>
                        updatePatient(row.key, {
                          glasses_prescription_sent: !row.glasses_prescription_sent,
                        })
                      }
                    >
                      {row.glasses_prescription_sent ? "Sent" : "Not sent"}
                    </Button>
                  </div>

                  {row.lens_order_required && (
                    <div>
                      <Label className="text-xs">Lens order status</Label>
                      <Select
                        value={row.lens_order_status || "pending"}
                        onValueChange={(value) =>
                          updatePatient(row.key, { lens_order_status: value })
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LENS_ORDER_STATUSES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Feedback form</Label>
                    <Button
                      type="button"
                      variant={row.feedback_form_sent ? "default" : "outline"}
                      className="w-full mt-1 h-9"
                      disabled={!canEdit}
                      onClick={() =>
                        updatePatient(row.key, {
                          feedback_form_sent: !row.feedback_form_sent,
                        })
                      }
                    >
                      {row.feedback_form_sent ? "Sent" : "Not sent"}
                    </Button>
                  </div>

                  <div>
                    <Label className="text-xs">Eye drops / medication</Label>
                    <div className="mt-1 h-9 rounded-md border bg-muted/30 px-3 flex items-center text-xs">
                      {row.eye_drop_quantity > 0
                        ? `${row.eye_drop_quantity} item${row.eye_drop_quantity === 1 ? "" : "s"} actually dispensed`
                        : "None dispensed"}
                    </div>
                  </div>
                </div>

                {row.patient_type === "hmo" && (
                  <div>
                    <Label className="text-xs">HMO claim remarks</Label>
                    <Textarea
                      value={row.hmo_claim_remarks || ""}
                      onChange={(e) =>
                        updatePatient(row.key, {
                          hmo_claim_remarks: e.target.value,
                        })
                      }
                      disabled={!canEdit}
                      placeholder="Example: claim emailed, awaiting response..."
                      className="mt-1 min-h-[70px]"
                    />
                  </div>
                )}

                {row.lens_order_required && (
                  <div>
                    <Label className="text-xs">Lens order remarks</Label>
                    <Textarea
                      value={row.lens_order_remarks || ""}
                      onChange={(e) =>
                        updatePatient(row.key, {
                          lens_order_remarks: e.target.value,
                        })
                      }
                      disabled={!canEdit}
                      placeholder="Example: order sent to lab..."
                      className="mt-1 min-h-[70px]"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-xs">Remarks</Label>
                  <Textarea
                    value={row.remarks || ""}
                    onChange={(e) =>
                      updatePatient(row.key, { remarks: e.target.value })
                    }
                    disabled={!canEdit}
                    placeholder="Anything relevant the front desk should record..."
                    className="mt-1 min-h-[70px]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => void savePatient(row)}
                    disabled={!canEdit || savingPatient === row.key}
                  >
                    {savingPatient === row.key ? (
                      <Loader2 size={14} className="mr-1 animate-spin" />
                    ) : (
                      <Save size={14} className="mr-1" />
                    )}
                    Save patient entry
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="form-section">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <Wallet size={16} className="text-primary" />
                Financial Overview
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Recorded payments, walk-in sales and daily expenses.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground">Cash</div>
              <div className="font-semibold mt-1">{formatMoney(financials?.cash_received)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground">Transfer</div>
              <div className="font-semibold mt-1">{formatMoney(financials?.transfer_received)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground">POS/Card</div>
              <div className="font-semibold mt-1">{formatMoney(financials?.card_received)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground">HMO</div>
              <div className="font-semibold mt-1">{formatMoney(financials?.hmo_received)}</div>
            </div>
            <div className="rounded-lg border p-3 col-span-2">
              <div className="text-[11px] text-muted-foreground">Total income</div>
              <div className="text-xl font-bold mt-1">{formatMoney(financials?.total_income)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground">Expenses</div>
              <div className="font-semibold mt-1">{formatMoney(financials?.total_expenses)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground">Daily balance</div>
              <div className="font-semibold mt-1">{formatMoney(financials?.daily_balance)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-muted/30 border p-3">
            <div className="text-xs font-medium">Recorded activity total</div>
            <div className="mt-1 text-sm">
              Other activities/sales entered manually: <strong>{formatMoney(activityTotal)}</strong>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <CreditCard size={16} className="text-primary" />
                Sales & Other Activities
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Use this for walk-in sales and other operational activity not already represented in patient rows.
              </p>
            </div>
            <Button size="sm" onClick={() => setActivityOpen(true)} disabled={!canEdit}>
              <Plus size={14} className="mr-1" /> Add activity
            </Button>
          </div>

          <div className="mt-4 space-y-2 max-h-[430px] overflow-auto">
            {activities.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No manually recorded activities.
              </div>
            ) : (
              activities.map((row) => (
                <div key={row.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{row.description}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {ACTIVITY_TYPES.find((x) => x.value === row.activity_type)?.label || row.activity_type}
                        {" · "}Qty {row.quantity}
                        {row.payment_method ? ` · ${row.payment_method}` : ""}
                      </div>
                      {row.customer_name && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Customer: {row.customer_name}
                        </div>
                      )}
                      {row.remarks && (
                        <div className="text-xs text-muted-foreground mt-1">{row.remarks}</div>
                      )}
                    </div>
                    <div className="font-semibold text-sm shrink-0">{formatMoney(row.amount)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Banknote size={16} className="text-primary" />
              Expenses
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Record actual expenses paid during the day. Keep financial notes below for anything that does not fit a structured field.
            </p>
          </div>
          <Button size="sm" onClick={() => setExpenseOpen(true)} disabled={!canEdit}>
            <Plus size={14} className="mr-1" /> Add expense
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3">Paid to</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No expenses recorded.
                  </td>
                </tr>
              ) : (
                expenses.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pr-3">{row.description}</td>
                    <td className="py-2 pr-3">{row.paid_to || "—"}</td>
                    <td className="py-2 pr-3 capitalize">{row.payment_method}</td>
                    <td className="py-2 pr-3 text-right font-medium">{formatMoney(row.amount)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.remarks || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-right text-sm font-semibold">
          Total structured expenses: {formatMoney(expenseTotal)}
        </div>
      </div>

      <div className="form-section">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <MessageSquare size={18} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Financial / Operational Notes</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Open area for cash given to front desk, unusual transactions, unresolved issues, stock notes, or anything else the manager should know.
            </p>
            <Textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="Type any additional financial or operational notes for the day..."
              className="mt-3 min-h-[130px]"
            />
            <div className="flex justify-end mt-3">
              <Button
                variant="outline"
                onClick={() => void saveNotes()}
                disabled={!canEdit || savingHeader}
              >
                {savingHeader ? (
                  <Loader2 size={15} className="mr-1 animate-spin" />
                ) : (
                  <Save size={15} className="mr-1" />
                )}
                Save notes
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="form-section border-primary/20 bg-primary/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              Finish today's report
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Review patient entries, activities, expenses and notes before submitting.
            </p>
          </div>
          <Button
            onClick={() => void submitReport()}
            disabled={!canEdit || savingHeader}
          >
            {savingHeader ? (
              <Loader2 size={16} className="mr-1 animate-spin" />
            ) : (
              <CheckCircle2 size={16} className="mr-1" />
            )}
            Submit & Lock Report
          </Button>
        </div>

        {isSubmitted && (
          <div className="mt-3 text-xs text-success flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            Submitted {formatDateTime(report?.submitted_at)}.
            The report is now read-only.
          </div>
        )}
      </div>

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add activity / sale</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Activity type</Label>
              <Select
                value={activityForm.activity_type}
                onValueChange={(value) =>
                  setActivityForm((f) => ({ ...f, activity_type: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Description</Label>
              <Input
                value={activityForm.description}
                onChange={(e) =>
                  setActivityForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Example: Walk-in frame sale"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={activityForm.quantity}
                onChange={(e) =>
                  setActivityForm((f) => ({ ...f, quantity: e.target.value }))
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                min="0"
                value={activityForm.amount}
                onChange={(e) =>
                  setActivityForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label>Payment method</Label>
              <Select
                value={activityForm.payment_method}
                onValueChange={(value) =>
                  setActivityForm((f) => ({ ...f, payment_method: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Customer name</Label>
              <Input
                value={activityForm.customer_name}
                onChange={(e) =>
                  setActivityForm((f) => ({ ...f, customer_name: e.target.value }))
                }
                placeholder="Optional"
                className="mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label>Remarks</Label>
              <Textarea
                value={activityForm.remarks}
                onChange={(e) =>
                  setActivityForm((f) => ({ ...f, remarks: e.target.value }))
                }
                placeholder="Optional"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void addActivity()} disabled={activitySaving}>
              {activitySaving && <Loader2 size={15} className="mr-1 animate-spin" />}
              Save activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Description</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Example: Cleaning supplies"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                min="0.01"
                value={expenseForm.amount}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label>Payment method</Label>
              <Select
                value={expenseForm.payment_method}
                onValueChange={(value) =>
                  setExpenseForm((f) => ({ ...f, payment_method: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Paid to</Label>
              <Input
                value={expenseForm.paid_to}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, paid_to: e.target.value }))
                }
                placeholder="Optional"
                className="mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label>Remarks</Label>
              <Textarea
                value={expenseForm.remarks}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, remarks: e.target.value }))
                }
                placeholder="Optional"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void addExpense()} disabled={expenseSaving}>
              {expenseSaving && <Loader2 size={15} className="mr-1 animate-spin" />}
              Save expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
