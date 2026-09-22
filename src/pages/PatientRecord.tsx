import OptoLoader from "@/components/OptoLoader";
import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { ensureBillingForVisit } from "@/lib/ensureBilling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { confirmDestructiveAction } from "@/lib/safeDelete";
import {
  ArrowLeft,
  Eye,
  Stethoscope,
  ClipboardList,
  History,
  Pencil,
  Gauge,
  Download,
  Phone,
  MessageCircle,
  CheckCircle2,
  Pill,
  FileText,
  CalendarPlus,
} from "lucide-react";
import { generateVisitPdf } from "@/lib/visitPdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess } from "@/hooks/useAccess";
import {
  QuickPicker, PickerChips,

  CHIEF_COMPLAINT_OPTIONS,
  HISTORY_OPTIONS,
  EXAM_OPTIONS,
  VA_DISTANCE_OPTIONS, VA_NEAR_OPTIONS,
  SPHERE_OPTIONS, CYL_OPTIONS, ADD_OPTIONS, AXIS_OPTIONS,
  REFRACTIVE_ERROR_OPTIONS, LENS_RECOMMENDATION_OPTIONS,
  ADVICE_OPTIONS, REFERRAL_OPTIONS, DIAGNOSIS_GROUPS,
  isValidPower, isValidAxis, isValidVaDistance, isValidVaNear,
} from "@/components/QuickPicker";
import { MedicationPicker, type MedItem } from "@/components/MedicationPicker";
import { getPaymentStatus, getPaymentStatusClass } from "@/lib/patientHistory";
import { AbbrTip } from "@/components/AbbrTip";
import { normalizeWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";
import { HMOVerificationCard, type HmoVerifStatus } from "@/components/HMOVerificationCard";
import { PatientWhatsAppMessages } from "@/components/PatientWhatsAppMessages";
import { ClinicalAiAssistant } from "@/components/ClinicalAiAssistant";
import { enqueueOfflineOperation, cachePatientOffline, cacheVisitsOffline, cacheVisitOffline, cacheStaffProfilesOffline, getStaffProfilesOffline } from "@/lib/offlineEngine";
import { offlineStore } from "@/lib/offlineStore";
import {
  MoreVertical,
  Trash2,
  Archive
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


interface PatientData {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  phone: string;
  address: string;
  next_of_kin: string;
  payment_type: string;
  active_hmo_id: string | null;
  enrollee_number: string;
  hmo_coverage_type?: string | null;
  hmo_principal_name?: string | null;
  hmo_relationship?: string | null;
  queue_number: number;
  queue_status: string;
  priority: string;
  patient_number?: string | null;
  preferred_contact_method?: string | null;
  created_by?: string | null;
  family_id?: string | null;
  family_relationship?: string | null;
}

interface PaymentHistoryItem {
  item_name: string;
  item_type: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface PaymentHistoryRow {
  id: string;
  visit_id: string | null;
  visit_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance: number;
  consultation_fee: number;
  discount_amount: number;
  discount_reason: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  items: PaymentHistoryItem[];
  payments: Array<{ amount: number; method: string; created_at: string; paid_by: string }>;
}

const emptyVisitForm = () => ({
  chiefComplaint: "", history: "", oldLensPrescription: "",
  // Unaided VA
  vaUnaidedOd: "", vaUnaidedOs: "", vaUnaidedOu: "",
  vaUnaidedOdPh: "", vaUnaidedOsPh: "",
  vaUnaidedNearOu: "",
  // Aided VA
  vaAidedOd: "", vaAidedOs: "", vaAidedOu: "",
  vaAidedNearOu: "",
  // Auto refraction
  autoOdSphere: "", autoOdCyl: "", autoOdAxis: "", autoVaOd: "",
  autoOsSphere: "", autoOsCyl: "", autoOsAxis: "", autoVaOs: "",
  // Subjective refraction
  subOdSphere: "", subOdCyl: "", subOdAxis: "", subVaOd: "",
  subOsSphere: "", subOsCyl: "", subOsAxis: "", subVaOs: "",
  subReadingAdd: "", subVaOutcome: "",
  examination: "",
  iopOd: "", iopOs: "", iopTime: "",
  diagnosis: "",
lensType: "",
medication: "",
  notes: "",
});

// ---- Subjective refraction display formatter (display only) ----
const normRx = (s?: string | null) => (s == null ? "" : String(s).trim());
const isBlankCyl = (c?: string | null) => {
  const n = normRx(c);
  if (n === "") return true;
  const num = parseFloat(n.replace(/[^\d.\-+]/g, ""));
  return !isNaN(num) && num === 0;
};
// Format one eye: drop meaningless cylinder/axis.
const fmtEyeRx = (sph?: string | null, cyl?: string | null, axis?: string | null) => {
  const s = normRx(sph) || "Plano";
  const c = normRx(cyl);
  const a = normRx(axis);
  if (isBlankCyl(c)) return s;
  const ax = a === "" ? "—" : a;
  return `${s} / ${c} × ${ax}`;
};
// True when both eyes share the complete sphere/cyl/axis prescription.
const sameEyeRx = (v: any) =>
  normRx(v.sub_od_sphere) === normRx(v.sub_os_sphere) &&
  normRx(v.sub_od_cyl) === normRx(v.sub_os_cyl) &&
  normRx(v.sub_od_axis) === normRx(v.sub_os_axis);
const eyeHasRx = (sph?: string | null, cyl?: string | null, axis?: string | null) =>
  normRx(sph) !== "" || normRx(cyl) !== "" || normRx(axis) !== "";

const hasOpticalPrescription = (visit: any) =>
  Boolean(
    visit?.lens_type ||
    visit?.sub_od_sphere ||
    visit?.sub_od_cyl ||
    visit?.sub_od_axis ||
    visit?.sub_os_sphere ||
    visit?.sub_os_cyl ||
    visit?.sub_os_axis ||
    visit?.sub_reading_add
  );

const PATIENT_RECORD_TIMEOUT_MS = 8000;

async function withPatientRecordTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`PatientRecord query timed out: ${label}`)),
          PATIENT_RECORD_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseMedicationItems(medication: string | null | undefined) {
  if (!medication) return [];

  return medication
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const medicationName = line.split("—")[0].trim();

      return {
        name: medicationName,
        prescribedText: line,
      };
    })
    .filter((item) => item.name);
}

export default function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  const patientId = id || "";
  const { effectiveClinicId: cid, role, user } = useAccess();

const isReceptionist = role === "receptionist";
const isClinicalUser =
  role === "doctor" ||
  role === "admin" ||
  role === "super_admin";  

const canViewFinancials =
  role === "admin" ||
  role === "super_admin" ||
  role === "receptionist";
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [hmos, setHmos] = useState<{ id: string; name: string; website?: string | null }[]>([]);
  const [hmoMap, setHmoMap] = useState<Map<string, { name: string; website?: string | null }>>(new Map());
  const [visits, setVisits] = useState<any[]>([]);
  const [doctorMap, setDoctorMap] = useState<Map<string, string>>(new Map());
  const [registrarMap, setRegistrarMap] = useState<Map<string, string>>(new Map());
  const [patientRegistrarName, setPatientRegistrarName] = useState<string | null>(null);
  const [responsibleDoctor, setResponsibleDoctor] = useState<{ id: string; full_name: string } | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Prevent rapid double-clicks from creating a second visit.
  const savingVisitRef = useRef(false);
  // A new visit keeps one stable id for the whole save attempt, making the
  // database insert idempotent even if two submit events race each other.
  const newVisitIdRef = useRef<string | null>(null);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("Follow-up");
  const [appointmentReason, setAppointmentReason] = useState("");
  const [showAppointmentBooking, setShowAppointmentBooking] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [appointmentCreated, setAppointmentCreated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingVisitId, setEditingVisitId] =
  useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PatientData>>({});
  const [form, setForm] = useState(emptyVisitForm());
  const [medications, setMedications] = useState<MedItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([]);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackLink, setFeedbackLink] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<
  "none" | "pending" | "completed"
>("none");
  const [visitFeedbackStatus, setVisitFeedbackStatus] = useState<
  Record<string, "none" | "pending" | "completed">
>({});
  const [feedbackDetails, setFeedbackDetails] = useState<Record<string, any>>({});
  const [medicationDispensingMap, setMedicationDispensingMap] =
  useState<
    Record<
      string,
      {
        dispensed: boolean;
        dispensed_at?: string | null;
        dispensed_by?: string | null;
      }
    >
  >({});

  const isPrescriptionReadyForFeedback = (visit: any) => {
    if (visit?.status !== "completed") return false;

    if (hasOpticalPrescription(visit) && visit.optical_dispensed !== true) {
      return false;
    }

    const medications = visit?.medication
      ? parseMedicationItems(visit.medication)
      : [];

    return medications.every((item: any) => {
      const key = `${visit.id}:${item.name.toLowerCase()}`;
      return medicationDispensingMap[key]?.dispensed === true;
    });
  };

  useEffect(() => {
    if (!patientId || !cid) { setLoading(false); return; }
    (async () => {
      try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cachedPatient = offlineStore.get<any>("patient-record:" + cid + ":" + patientId);
        const cachedVisits = offlineStore.get<any[]>("patient-visits:" + cid + ":" + patientId) ?? [];
        if (cachedPatient) {
          setPatient(cachedPatient);
          setVisits(cachedVisits);

          // Staff identities are cached with the clinical records so offline
          // history can still identify the doctor and registrar.
          const cachedStaff = getStaffProfilesOffline(cid);
          const cachedStaffMap = new Map(cachedStaff.map((staff: any) => [staff.id, staff]));
          const cachedDoctorMap = new Map<string, string>();
          const cachedRegistrarMap = new Map<string, string>();
          const cachedPatientRegistrar = cachedPatient.created_by
            ? cachedStaffMap.get(cachedPatient.created_by)
            : null;
          cachedVisits.forEach((visit: any) => {
            const staffDoctor = cachedStaffMap.get(visit.doctor_id);
            const staffRegistrar = cachedStaffMap.get(visit.registered_by);
            if (staffDoctor) cachedDoctorMap.set(visit.doctor_id, formatStaffName(staffDoctor, true));
            if (staffRegistrar) cachedRegistrarMap.set(visit.registered_by, formatStaffName(staffRegistrar, false));
          });
          setDoctorMap(cachedDoctorMap);
          setRegistrarMap(cachedRegistrarMap);
          if (cachedPatientRegistrar) {
            const name = (cachedPatientRegistrar.full_name || "").trim();
            const title = (cachedPatientRegistrar.title || "").trim();
            setPatientRegistrarName(
              title
                ? (/^dr\.?$/i.test(title)
                    ? `Dr. ${name.replace(/^dr\.?\s+/i, "")}`
                    : `${title} ${name}`)
                : name
            );
          } else {
            setPatientRegistrarName(null);
          }

          setLoading(false);
          toast.info(
            cachedVisits.length > 0
              ? "Offline mode — showing the last synchronized patient record and visit history."
              : "Offline mode — showing the last synchronized patient record."
          );
          return;
        }
      }

      const [
        patientSettled,
        visitsSettled,
        hmosSettled,
        clinicSettled,
      ] = await Promise.allSettled([
        withPatientRecordTimeout(
          apiClient
            .from("patients")
            .select("*")
            .eq("clinic_id", cid)
            .eq("id", patientId)
            .maybeSingle(),
          "patient",
        ),
        withPatientRecordTimeout(
          isReceptionist
            ? apiClient.rpc("get_receptionist_patient_visits", {
                p_patient_id: patientId,
              })
            : apiClient
                .from("visits")
                .select("*")
                .eq("clinic_id", cid)
                .eq("patient_id", patientId)
                .order("created_at", { ascending: false }),
          "visits",
        ),
        withPatientRecordTimeout(
          apiClient
            .from("hmos")
            .select("id, name, website")
            .eq("clinic_id", cid)
            .eq("status", "active"),
          "hmos",
        ),
        withPatientRecordTimeout(
          apiClient
            .from("clinics")
            .select("name")
            .eq("id", cid)
            .maybeSingle(),
          "clinic",
        ),
      ]);

      const patRes =
        patientSettled.status === "fulfilled"
          ? patientSettled.value
          : { data: null, error: patientSettled.reason };

      const visRes =
        visitsSettled.status === "fulfilled"
          ? visitsSettled.value
          : { data: [], error: visitsSettled.reason };

      const hmoRes =
        hmosSettled.status === "fulfilled"
          ? hmosSettled.value
          : { data: [], error: hmosSettled.reason };

      const clinicRes =
        clinicSettled.status === "fulfilled"
          ? clinicSettled.value
          : { data: null, error: clinicSettled.reason };

      if (patientSettled.status === "rejected") {
        console.error("[patient-record:patient-load-failed]", patientSettled.reason);
      }
      if (visitsSettled.status === "rejected") {
        console.error("[patient-record:visits-load-failed]", visitsSettled.reason);
      }
      if (hmosSettled.status === "rejected") {
        console.warn("[patient-record:hmo-load-failed]", hmosSettled.reason);
      }
      if (clinicSettled.status === "rejected") {
        console.warn("[patient-record:clinic-load-failed]", clinicSettled.reason);
      }
        
      console.debug("[patient-record]", { clinic_id: cid, patient_id: patientId, visits: visRes.data?.length ?? 0 });
  if (!patRes.data) {
    toast.error("Unable to load this patient record. Please try again.");
    return;
  }

  {
  const activeHmo =
    hmoRes.data?.find(
      (h: any) => h.id === patRes.data.active_hmo_id
    );

  setPatient({
    ...patRes.data,
    clinic_name: clinicRes.data?.name || "",
    hmo_name: activeHmo?.name || "",
  } as any);
  }

      if (visRes.data) {
  cacheVisitsOffline(cid, patientId, visRes.data);
  cachePatientOffline(cid, { ...patRes.data, clinic_name: clinicRes.data?.name || "", hmo_name: hmoRes.data?.find((h: any) => h.id === patRes.data.active_hmo_id)?.name || "" });
  console.log("VISITS FROM DB", visRes.data);
  setVisits(visRes.data);
      }

      // The patient and visit data are the critical content required to render
      // the record. Stop showing the page loader now; secondary data can load
      // in the background without blocking the patient record.
      setLoading(false);

      if (visRes.data) {
       const doctorIds = [
    ...new Set(
      visRes.data
        .map((visit: any) => visit.doctor_id)
        .filter(Boolean)
    ),
  ];

  const registeredByIds = [
    ...new Set(
      visRes.data
        .map((visit: any) => visit.registered_by)
        .filter(Boolean)
    ),
  ];

  const patientCreatedById = (patRes.data as any)?.created_by || null;
  const staffIds = [...new Set([...doctorIds, ...registeredByIds, patientCreatedById].filter(Boolean))];

  if (staffIds.length > 0) {
    const { data: staffProfiles } = await apiClient
      .from("profiles")
      .select("id, full_name, role, title")
      .in("id", staffIds);

    const nextDoctorMap = new Map<string, string>();
    const nextRegistrarMap = new Map<string, string>();
    const formatStaffName = (staff: any, asDoctor = false) => {
      let name = (staff?.full_name || "").trim();
      if (!name) return "Not recorded";
      const title = (staff?.title || "").trim();
      // Prevent duplicated titles such as "Dr. Dr. Obinna Kalu".
      if (/^dr\.?\s+/i.test(name)) name = name.replace(/^dr\.?\s+/i, "").trim();
      if (title) return /^dr\.?$/i.test(title) ? `Dr. ${name}` : `${title} ${name}`;
      if (asDoctor || staff?.role === "doctor") return `Dr. ${name}`;
      return name;
    };

    (staffProfiles || []).forEach((staff: any) => {
      if (doctorIds.includes(staff.id)) {
        nextDoctorMap.set(staff.id, formatStaffName(staff, true));
      }
      if (registeredByIds.includes(staff.id)) {
        nextRegistrarMap.set(staff.id, formatStaffName(staff, false));
      }
    });
    cacheStaffProfilesOffline(cid, staffProfiles || []);

    setDoctorMap(nextDoctorMap);
    setRegistrarMap(nextRegistrarMap);
    setPatientRegistrarName(
      patientCreatedById
        ? formatStaffName(
            (staffProfiles || []).find((staff: any) => staff.id === patientCreatedById),
            false,
          )
        : null,
    );
  } else {
    setDoctorMap(new Map());
    setRegistrarMap(new Map());
  }
      }  

            // Load individual medication dispensing records
      if (visRes.data && visRes.data.length > 0) {
        const visitIds = visRes.data.map(
          (visit: any) => visit.id
        );

        const { data: medicationDispensingData, error: medicationDispensingError } =
          await apiClient
            .from("visit_medication_dispensing")
            .select(
              "visit_id, medication_name, dispensed, dispensed_at, dispensed_by"
            )
            .in("visit_id", visitIds);

        if (medicationDispensingError) {
          console.error(
            "Failed to load medication dispensing records:",
            medicationDispensingError
          );
        } else {
          const medicationMap: Record<
            string,
            {
              dispensed: boolean;
              dispensed_at?: string | null;
              dispensed_by?: string | null;
            }
          > = {};

          (medicationDispensingData || []).forEach(
            (item: any) => {
              medicationMap[
                `${item.visit_id}:${item.medication_name.toLowerCase()}`
              ] = {
                dispensed: item.dispensed,
                dispensed_at: item.dispensed_at,
                dispensed_by: item.dispensed_by,
              };
            }
          );

          setMedicationDispensingMap(medicationMap);
        }
      } else {
        setMedicationDispensingMap({});
      }

            // Load feedback separately so feedback cannot block PatientRecord
// from displaying.
setVisitFeedbackStatus({});
setFeedbackDetails({});

if (visRes.data && visRes.data.length > 0) {
  const visitsForFeedback = [...visRes.data];

  // Run after the main PatientRecord has rendered.
  setTimeout(async () => {
    try {
      const statusMap: Record<
        string,
        "none" | "pending" | "completed"
      > = {};

      for (const visit of visitsForFeedback) {
        try {
          const { data: status } = await apiClient.rpc(
            "get_feedback_status_for_visit",
            {
              p_visit_id: visit.id,
            }
          );

          statusMap[visit.id] =
            status === "completed"
              ? "completed"
              : status === "pending"
                ? "pending"
                : "none";
        } catch (error) {
          console.warn(
            "Feedback status failed for visit:",
            visit.id,
            error
          );

          statusMap[visit.id] = "none";
        }
      }

      setVisitFeedbackStatus(statusMap);

      const feedbackDetailMap: Record<string, any> = {};

      for (const visit of visitsForFeedback) {
        try {
          const { data: feedback } = await apiClient.rpc(
            "get_feedback_details_for_visit",
            {
              p_visit_id: visit.id,
            }
          );

          const detail = Array.isArray(feedback)
            ? feedback[0]
            : feedback;

          if (detail) {
            feedbackDetailMap[visit.id] = detail;
          }
        } catch (error) {
          console.warn(
            "Feedback details failed for visit:",
            visit.id,
            error
          );
        }
      }

      setFeedbackDetails(feedbackDetailMap);
    } catch (error) {
      console.warn(
        "Background feedback loading failed:",
        error
      );
    }
  }, 0);
} else {
  setVisitFeedbackStatus({});
}

      if (canViewFinancials) {
        const { data: billingRows } = await apiClient
          .from("billing")
          .select("id, visit_id, total_amount, amount_paid, balance, consultation_fee, discount_amount, discount_reason, status, notes, created_at")
          .eq("clinic_id", cid)
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });
        const billingIds = (billingRows || []).map((bill: any) => bill.id);
        const [{ data: billingItems }, { data: paymentRows }] = billingIds.length > 0
          ? await Promise.all([
              apiClient
                .from("billing_items")
                .select("billing_id, item_name, item_type, quantity, unit_price, total_price")
                .eq("clinic_id", cid)
                .in("billing_id", billingIds)
                .order("created_at", { ascending: true }),
              apiClient
                .from("payments")
                .select("billing_id, amount, method, paid_by, created_at")
                .eq("clinic_id", cid)
                .in("billing_id", billingIds)
                .order("created_at", { ascending: false }),
            ])
          : [{ data: [] }, { data: [] }];

        const itemsMap = new Map<string, PaymentHistoryItem[]>();
        (billingItems || []).forEach((item: any) => {
          const rows = itemsMap.get(item.billing_id) || [];
          rows.push({
            item_name: item.item_name || item.item_type || "Item",
            item_type: item.item_type || null,
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
            total_price: Number(item.total_price) || 0,
          });
          itemsMap.set(item.billing_id, rows);
        });

        const paymentsMap = new Map<string, PaymentHistoryRow["payments"]>();
        (paymentRows || []).forEach((payment: any) => {
          const rows = paymentsMap.get(payment.billing_id) || [];
          rows.push(payment);
          paymentsMap.set(payment.billing_id, rows);
        });

        const actualBillingRows = (billingRows || []).filter(
          (bill: any) =>
            Number(bill.total_amount) > 0 ||
            Number(bill.amount_paid) > 0
        );

        setPaymentHistory(actualBillingRows.map((bill: any) => {
          const visit = (visRes.data || []).find((entry: any) => entry.id === bill.visit_id);
          return {
            ...bill,
            visit_date: visit?.created_at || bill.created_at,
            consultation_fee: Number(bill.consultation_fee) || 0,
            discount_amount: Number(bill.discount_amount) || 0,
            discount_reason: bill.discount_reason || null,
            items: itemsMap.get(bill.id) || [],
            payments: paymentsMap.get(bill.id) || [],
          };
        }));
      } else {
        setPaymentHistory([]);
      }
      if (hmoRes.data) {
        setHmos(hmoRes.data as any);
        setHmoMap(new Map((hmoRes.data as any[]).map(h => [h.id, { name: h.name, website: h.website }])));
      }
      // Load clinic medications only for clinical users.
// Receptionists do not need access to drug inventory.
if (!isReceptionist) {
  const { data: medRes } = await apiClient
    .from("inventory")
    .select("id, name, drug_category, category")
    .eq("clinic_id", cid);

  console.log("inventory meds:", medRes);

  if (medRes) {
    const meds = (medRes as any[])
      .filter(m => m.name)
      .map(m => ({
        id: m.id,
        name: m.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log("mapped meds:", meds);

    setMedications(meds);
  }
} else {
  setMedications([]);
}

      
       } catch (error) {
      console.error("[patient-record] load failed:", error);
      toast.error("Unable to load patient record");
    } finally {
      setLoading(false);
      }
    })();
  }, [patientId, cid, canViewFinancials]);


  // Resolve the operational doctor for the active clinic automatically.
  // Super-admin identities are intentionally excluded from the clinic's clinical
  // doctor list, even when a super-admin also has a legacy doctor membership.
  useEffect(() => {
    let cancelled = false;

    if (!cid) {
      setResponsibleDoctor(null);
      setSelectedDoctorId(null);
      return;
    }

    (async () => {
      const { data: staffRows, error: staffError } = await apiClient
        .from("clinic_users")
        .select("user_id, role")
        .eq("clinic_id", cid)
        .eq("role", "doctor");

      if (cancelled) return;

      if (staffError) {
        console.warn("[patient-record:doctor-resolve-failed]", staffError);
        setResponsibleDoctor(null);
        setSelectedDoctorId(null);
        return;
      }

      const doctorIds = [...new Set(
        (staffRows || [])
          .map((row: any) => row.user_id)
          .filter(Boolean)
      )];

      if (doctorIds.length === 0) {
        setResponsibleDoctor(null);
        setSelectedDoctorId(null);
        return;
      }

      const { data: profiles, error: profileError } = await apiClient
        .from("profiles")
        .select("id, full_name, is_super_admin")
        .in("id", doctorIds);

      if (cancelled) return;

      if (profileError) {
        console.warn("[patient-record:doctor-profile-failed]", profileError);
        setResponsibleDoctor(null);
        setSelectedDoctorId(null);
        return;
      }

      const operationalDoctors = (profiles || [])
        .filter((profile: any) => profile.is_super_admin !== true)
        .map((profile: any) => ({
          id: profile.id,
          full_name: profile.full_name || "Doctor",
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

      // If the logged-in user is a clinic doctor, keep attribution on that
      // doctor. Otherwise use the clinic's first operational doctor.
      const currentDoctor = user?.id
        ? operationalDoctors.find((doctor) => doctor.id === user.id)
        : null;

      const editingDoctorId = editingVisitId
        ? visits.find((visit: any) => visit.id === editingVisitId)?.doctor_id
        : null;

      const existingOperationalDoctor = editingDoctorId
        ? operationalDoctors.find((doctor) => doctor.id === editingDoctorId)
        : null;

      const preferredDoctor =
        currentDoctor ||
        existingOperationalDoctor ||
        operationalDoctors[0] ||
        null;

      setResponsibleDoctor(preferredDoctor);
      setSelectedDoctorId(preferredDoctor?.id || null);
    })();

    return () => {
      cancelled = true;
    };
  }, [cid, user?.id, role, editingVisitId, visits]);

  const setField = (k: string, v: string) =>
  setForm(prev => ({
    ...prev,
    [k]: v,
  }));
  const startEditVisit = (v: any) => {
  setEditingVisitId(v.id);
  setSelectedDoctorId(v.doctor_id || (role === "doctor" ? user?.id ?? null : null));
    console.log("Editing visit:", v.id);

  setForm({
    ...emptyVisitForm(),

    chiefComplaint: v.chief_complaint || "",
    history: v.history || "",
    examination: v.examination || "",
    diagnosis: v.diagnosis || "",
    lensType: v.lens_type || "",
    medication: v.medication || "",
    notes: v.notes || "",

    vaUnaidedOd: v.va_unaided_od || "",
vaUnaidedOs: v.va_unaided_os || "",
vaUnaidedOu: v.va_unaided_ou || "",

vaUnaidedOdPh: v.va_unaided_od_ph || "",
vaUnaidedOsPh: v.va_unaided_os_ph || "",

vaUnaidedNearOu: v.va_unaided_near_ou || "",

vaAidedOd: v.va_aided_od || "",
vaAidedOs: v.va_aided_os || "",
vaAidedOu: v.va_aided_ou || "",
vaAidedNearOu: v.va_aided_near_ou || "",

autoOdSphere: v.auto_od_sphere || "",
autoOdCyl: v.auto_od_cyl || "",
autoOdAxis: v.auto_od_axis || "",
autoVaOd: v.auto_va_od || "",

autoOsSphere: v.auto_os_sphere || "",
autoOsCyl: v.auto_os_cyl || "",
autoOsAxis: v.auto_os_axis || "",
autoVaOs: v.auto_va_os || "",

subOdSphere: v.sub_od_sphere || "",
subOdCyl: v.sub_od_cyl || "",
subOdAxis: v.sub_od_axis || "",
subVaOd: v.sub_va_od || "",

subOsSphere: v.sub_os_sphere || "",
subOsCyl: v.sub_os_cyl || "",
subOsAxis: v.sub_os_axis || "",
subVaOs: v.sub_va_os || "",

subReadingAdd: v.sub_reading_add || "",
subVaOutcome: v.sub_va_outcome || "",

    iopOd: v.iop_od?.toString() || "",
    iopOs: v.iop_os?.toString() || "",
    iopTime: v.iop_time || "",
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};


  const bookFollowUpAppointment = async () => {
    if (!cid || !patient || !appointmentDate || !appointmentTime) {
      toast.error("Select a follow-up date and time.");
      return;
    }

    setSavingAppointment(true);
    try {
      const { data, error } = await apiClient
        .from("appointments")
        .insert({
          clinic_id: cid,
          patient_id: patient.id,
          doctor_id: selectedDoctorId || user?.id || null,
          visit_id: editingVisitId || null,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          reason: appointmentReason || "Follow-up",
          status: "pending",
          source: "auto",
        } as any)
        .select("id")
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      setAppointmentCreated(true);
      toast.success("Follow-up appointment booked and added to Appointments.");
      setShowAppointmentBooking(false);
      setAppointmentDate("");
      setAppointmentTime("");
      setAppointmentReason("");
    } finally {
      setSavingAppointment(false);
    }
  };

  const handleSaveVisit = async (markCompleted: boolean) => {
    if (!isClinicalUser) {
  toast.error("You do not have permission to create or edit clinical visits");
  return;
    }
    if (!patient) return;
    if (!cid) { toast.error("No active clinic"); return; }

    // A completed visit must never be submitted as a brand-new visit.
    // This also protects against reopening an already-completed visit and
    // pressing Complete again.
    if (markCompleted && editingVisitId) {
      const existingVisit = visits.find(v => v.id === editingVisitId);
      if (existingVisit?.status === "completed") {
        toast.warning("This visit has already been completed and saved. No second visit was created.");
        return;
      }
    }

    const {
    data: { user },
    error: authError,
  } = await apiClient.auth.getUser();

  if (authError || !user) {
    toast.error("Unable to identify the logged-in user");
    return;
  }

    // Never create an empty clinical visit. A visit must contain at least
    // one piece of actual clinical information before it can be completed.
    const hasClinicalInformation = Object.values(form).some(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    if (markCompleted && !hasClinicalInformation) {
      toast.error("Add at least one clinical finding, measurement, diagnosis, treatment, or note before completing this visit.");
      return;
    }

    // Validation
    const vaDistFields: [string, string][] = [
      ["Unaided OD", form.vaUnaidedOd], ["Unaided OS", form.vaUnaidedOs], ["Unaided OU", form.vaUnaidedOu],
      ["Pinhole OD", form.vaUnaidedOdPh], ["Pinhole OS", form.vaUnaidedOsPh],
      ["Aided OD", form.vaAidedOd], ["Aided OS", form.vaAidedOs], ["Aided OU", form.vaAidedOu],
      ["Auto VA OD", form.autoVaOd], ["Auto VA OS", form.autoVaOs],
      ["Sub VA OD", form.subVaOd], ["Sub VA OS", form.subVaOs],
    ];
    for (const [label, val] of vaDistFields) {
      if (!isValidVaDistance(val)) { toast.error(`Invalid VA value for ${label}: "${val}"`); return; }
    }
    const vaNearFields: [string, string][] = [
      ["Near Unaided", form.vaUnaidedNearOu], ["Near Aided", form.vaAidedNearOu],
      ["VA Outcome", form.subVaOutcome],
    ];
    for (const [label, val] of vaNearFields) {
      if (!isValidVaNear(val)) { toast.error(`Invalid Near VA for ${label}: "${val}"`); return; }
    }
    const powerFields: [string, string][] = [
      ["Auto OD Sphere", form.autoOdSphere], ["Auto OD Cyl", form.autoOdCyl],
      ["Auto OS Sphere", form.autoOsSphere], ["Auto OS Cyl", form.autoOsCyl],
      ["Sub OD Sphere", form.subOdSphere], ["Sub OD Cyl", form.subOdCyl],
      ["Sub OS Sphere", form.subOsSphere], ["Sub OS Cyl", form.subOsCyl],
      ["Reading ADD", form.subReadingAdd],
    ];
    for (const [label, val] of powerFields) {
      if (!isValidPower(val)) { toast.error(`${label} must be in 0.25 steps (e.g. -1.25): "${val}"`); return; }
    }
    const axisFields: [string, string][] = [
      ["Auto OD Axis", form.autoOdAxis], ["Auto OS Axis", form.autoOsAxis],
      ["Sub OD Axis", form.subOdAxis], ["Sub OS Axis", form.subOsAxis],
    ];
    for (const [label, val] of axisFields) {
      if (!isValidAxis(val)) { toast.error(`${label} must be 1–180: "${val}"`); return; }
    }

    // Resolve the doctor again at submit time so a slow staff/profile
    // lookup cannot incorrectly block an otherwise valid clinic visit.
    // Priority: selected doctor -> existing visit doctor -> logged-in clinic
    // doctor -> resolved operational doctor.
    const editingVisit = editingVisitId
      ? visits.find((visit: any) => visit.id === editingVisitId)
      : null;

    let visitDoctorId =
      selectedDoctorId ||
      editingVisit?.doctor_id ||
      null;

    if (!visitDoctorId && role === "doctor" && user?.id) {
      visitDoctorId = user.id;
    }

    if (!visitDoctorId && responsibleDoctor?.id) {
      visitDoctorId = responsibleDoctor.id;
    }

    if (!visitDoctorId) {
      toast.error("No clinic doctor is available for this visit. Please assign a clinic doctor and try again.");
      return;
    }

    if (savingVisitRef.current) {
      toast.warning("This visit is already being saved. Please wait for it to finish.");
      return;
    }

    savingVisitRef.current = true;
    setSaving(true);

const visitId = editingVisitId || newVisitIdRef.current || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "visit-" + Date.now() + "-" + Math.random().toString(36).slice(2));
if (!editingVisitId) newVisitIdRef.current = visitId;

const visitPayload = {
  id: visitId,
  clinic_id: cid,
  patient_id: patient.id,
  doctor_id: visitDoctorId,
  registered_by: editingVisitId
    ? visits.find(v => v.id === editingVisitId)?.registered_by || user.id
    : user.id,

  payment_type: patient.payment_type,
  active_hmo_id: patient.active_hmo_id,

  chief_complaint: form.chiefComplaint || null,
  history: form.history || null,
  old_lens_prescription: form.oldLensPrescription || null,

  va_unaided_od: form.vaUnaidedOd || null,
  va_unaided_os: form.vaUnaidedOs || null,
  va_unaided_ou: form.vaUnaidedOu || null,

  va_unaided_od_ph: form.vaUnaidedOdPh || null,
  va_unaided_os_ph: form.vaUnaidedOsPh || null,

  va_unaided_near_ou: form.vaUnaidedNearOu || null,

  va_aided_od: form.vaAidedOd || null,
  va_aided_os: form.vaAidedOs || null,
  va_aided_ou: form.vaAidedOu || null,

  va_aided_near_ou: form.vaAidedNearOu || null,

  auto_od_sphere: form.autoOdSphere || null,
  auto_od_cyl: form.autoOdCyl || null,
  auto_od_axis: form.autoOdAxis || null,
  auto_va_od: form.autoVaOd || null,

  auto_os_sphere: form.autoOsSphere || null,
  auto_os_cyl: form.autoOsCyl || null,
  auto_os_axis: form.autoOsAxis || null,
  auto_va_os: form.autoVaOs || null,

  sub_od_sphere: form.subOdSphere || null,
  sub_od_cyl: form.subOdCyl || null,
  sub_od_axis: form.subOdAxis || null,
  sub_va_od: form.subVaOd || null,

  sub_os_sphere: form.subOsSphere || null,
  sub_os_cyl: form.subOsCyl || null,
  sub_os_axis: form.subOsAxis || null,
  sub_va_os: form.subVaOs || null,

  sub_reading_add: form.subReadingAdd || null,
  sub_va_outcome: form.subVaOutcome || null,

  examination: form.examination || null,

  iop_od: form.iopOd ? Number(form.iopOd) : null,
  iop_os: form.iopOs ? Number(form.iopOs) : null,
  iop_time: form.iopTime || null,

  diagnosis: form.diagnosis || null,
  lens_type: form.lensType || null,
  medication: form.medication || null,
  notes: form.notes || null,

  status: markCompleted ? "completed" : "open",
  completed_at: markCompleted
    ? new Date().toISOString()
    : null,
};

if (typeof navigator !== "undefined" && !navigator.onLine) {
  const localVisit = {
    ...visitPayload,
    created_at: editingVisitId ? (visits.find(v => v.id === editingVisitId)?.created_at || new Date().toISOString()) : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    offline_pending_sync: true,
  };
  await enqueueOfflineOperation({
    clinicId: cid,
    userId: user.id,
    kind: "visit.save",
    entityId: visitId,
    payload: visitPayload,
  });
  cacheVisitOffline(cid, patient.id, localVisit);
  const currentVisits = offlineStore.get<any[]>("patient-visits:" + cid + ":" + patient.id) ?? visits;
  setVisits([localVisit, ...currentVisits.filter(v => v.id !== localVisit.id)]);
  setSaving(false);
  savingVisitRef.current = false;
  newVisitIdRef.current = null;
  toast.success(markCompleted ? "Visit completed offline — it will sync automatically." : "Visit saved offline — it will sync automatically.");
  setEditingVisitId(null);
  setForm(emptyVisitForm());
  return;
}

const { data, error } = editingVisitId
  ? await apiClient
      .from("visits")
      .update(visitPayload)
      .eq("id", editingVisitId)
      .select()
      .single()
  : await apiClient
      .from("visits")
      .insert(visitPayload)
      .select()
      .single();
    setSaving(false);
    if (error) {
  savingVisitRef.current = false;
  if (error.code === "23505" && !editingVisitId) {
    toast.warning("This visit has already been saved or completed. It was not saved twice.");
  } else {
    toast.error(error.message);
  }
  return;
    }

    // ----------------------------------------------------
// Safety net: Ensure completed visits always have a bill
// ----------------------------------------------------

if (
  markCompleted &&
  data
) {
  try {
    await ensureBillingForVisit({
      id: data.id,
      clinic_id: data.clinic_id,
      patient_id: data.patient_id,
      payment_type: data.payment_type,
      active_hmo_id: data.active_hmo_id,
    });
  } catch (err: any) {
    console.error(
      "Failed to ensure billing:",
      err
    );

    toast.error(
      "Visit was completed, but billing could not be verified."
    );

    return;
  }
}
    savingVisitRef.current = false;
    newVisitIdRef.current = null;
    toast.success(markCompleted ? "Visit completed — bill auto-created" : "Visit saved");
    setEditingVisitId(null);
    setForm(emptyVisitForm());
    // Re-sync visit history from DB so Past tab always reflects server state
    const { data: fresh } = await apiClient
      .from("visits").select("*").eq("clinic_id", cid).eq("patient_id", patient.id)
      .order("created_at", { ascending: false });
    if (fresh) setVisits(fresh);
    else if (data) setVisits([data, ...visits]);
  };

    const handleMarkDispensed = async (
    visitId: string,
    itemType: "optical" | "medication"
  ) => {
    if (!cid || !patient) {
      toast.error("No active clinic or patient");
      return;
    }

    try {
      const { data, error } = await apiClient.rpc(
        "mark_visit_item_dispensed",
        {
          p_visit_id: visitId,
          p_item_type: itemType,
          p_inventory_id: null,
        }
      );

      if (error) {
        console.error("Dispensing error:", error);
        toast.error(
          error.message || "Unable to mark item as dispensed"
        );
        return;
      }

      console.log("Dispensing result:", data);

      if (itemType === "optical") {
        setVisits(prev =>
          prev.map(v =>
            v.id === visitId
              ? {
                  ...v,
                  optical_dispensed: true,
                  optical_dispensed_at:
                    v.optical_dispensed_at || new Date().toISOString(),
                }
              : v
          )
        );
      }

      toast.success(
        itemType === "optical"
          ? "Optical prescription marked as dispensed"
          : "Medication marked as dispensed"
      );

      // Refresh visit history from the database
      const { data: fresh, error: refreshError } =
        await apiClient
          .from("visits")
          .select("*")
          .eq("clinic_id", cid)
          .eq("patient_id", patient.id)
          .order("created_at", { ascending: false });

      if (refreshError) {
        console.error(
          "Failed to refresh visits:",
          refreshError
        );
        return;
      }

      if (fresh) {
        setVisits(fresh);
      }
    } catch (err: any) {
      console.error("Unexpected dispensing error:", err);

      toast.error(
        err?.message || "Unable to mark item as dispensed"
      );
    }
  };

  const handleMarkMedicationDispensed = async (
  visitId: string,
  medicationName: string
) => {
  if (!cid || !patient) {
    toast.error("No active clinic or patient");
    return;
  }

  try {
    const { data, error } = await apiClient.rpc(
      "mark_medication_item_dispensed",
      {
        p_visit_id: visitId,
        p_medication_name: medicationName,
        p_inventory_id: null,
      }
    );

    if (error) {
      console.error("Medication dispensing error:", error);

      toast.error(
        error.message || "Unable to mark medication as dispensed"
      );

      return;
    }

    console.log("Medication dispensing result:", data);

    const medicationKey = `${visitId}:${medicationName.toLowerCase()}`;
    setMedicationDispensingMap(prev => ({
      ...prev,
      [medicationKey]: {
        ...(prev[medicationKey] || {}),
        dispensed: true,
        dispensed_at:
          prev[medicationKey]?.dispensed_at || new Date().toISOString(),
      },
    }));

    toast.success(`${medicationName} marked as dispensed`);

    const { data: dispensingData, error: dispensingError } =
      await apiClient
        .from("visit_medication_dispensing")
        .select(
          "medication_name, dispensed, dispensed_at, dispensed_by"
        )
        .eq("visit_id", visitId);

    if (dispensingError) {
      console.error(
        "Failed to refresh medication dispensing:",
        dispensingError
      );
      return;
    }

    const nextMap: Record<
      string,
      {
        dispensed: boolean;
        dispensed_at?: string | null;
        dispensed_by?: string | null;
      }
    > = {};

    (dispensingData || []).forEach((item: any) => {
      nextMap[
        `${visitId}:${item.medication_name.toLowerCase()}`
      ] = {
        dispensed: item.dispensed,
        dispensed_at: item.dispensed_at,
        dispensed_by: item.dispensed_by,
      };
    });

    setMedicationDispensingMap((prev) => ({
      ...prev,
      ...nextMap,
    }));
  } catch (err: any) {
    console.error(
      "Unexpected medication dispensing error:",
      err
    );

    toast.error(
      err?.message ||
        "Unable to mark medication as dispensed"
    );
  }
};

  const handleEditPatient = async () => {
    if (!patient) return;
    if (!cid) { toast.error("No active clinic"); return; }
    const { error } = await apiClient.from("patients").update({
      full_name: editForm.full_name,
      age: editForm.age,
      gender: editForm.gender,
      phone: normalizeWhatsAppNumber(editForm.phone) ? `+${normalizeWhatsAppNumber(editForm.phone)}` : "",
      preferred_contact_method: editForm.preferred_contact_method || "whatsapp",
      address: editForm.address,
      next_of_kin: editForm.next_of_kin,
      payment_type: editForm.payment_type,
      active_hmo_id: editForm.payment_type === "hmo" ? editForm.active_hmo_id : null,
      enrollee_number: editForm.payment_type === "hmo" ? (editForm.enrollee_number || "").trim() : "",
      hmo_coverage_type:
      editForm.payment_type === "hmo"
    ? editForm.hmo_coverage_type
    : null,

hmo_principal_name:
  editForm.payment_type === "hmo"
    ? editForm.hmo_principal_name
    : null,

hmo_relationship:
  editForm.payment_type === "hmo"
    ? editForm.hmo_relationship
    : null,
    } as any).eq("clinic_id", cid).eq("id", patient.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient info updated");
    setPatient({ ...patient, ...editForm } as PatientData);
    setEditing(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>;
  if (!patient) return <p className="text-center py-12 text-muted-foreground">Patient not found.</p>;

  function getCurrentPatientAge(
  dateOfBirth: string | null | undefined,
  storedAge: number | null | undefined
) {
  if (!dateOfBirth) {
    return storedAge !== null && storedAge !== undefined
      ? `${storedAge} years`
      : "—";
  }

  const dob = new Date(dateOfBirth);
  const today = new Date();

  if (
    Number.isNaN(dob.getTime()) ||
    dob > today
  ) {
    return storedAge !== null && storedAge !== undefined
      ? `${storedAge} years`
      : "—";
  }

  let years =
    today.getFullYear() -
    dob.getFullYear();

  const monthDifference =
    today.getMonth() -
    dob.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 &&
      today.getDate() < dob.getDate())
  ) {
    years--;
  }

  if (years >= 1) {
    return `${years} ${years === 1 ? "year" : "years"}`;
  }

  const differenceInDays = Math.floor(
    (today.getTime() - dob.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (differenceInDays < 7) {
    return `${differenceInDays} ${
      differenceInDays === 1 ? "day" : "days"
    }`;
  }

  if (differenceInDays < 30) {
    const weeks = Math.floor(
      differenceInDays / 7
    );

    return `${weeks} ${
      weeks === 1 ? "week" : "weeks"
    }`;
  }

  const months =
    (today.getFullYear() - dob.getFullYear()) *
      12 +
    (today.getMonth() - dob.getMonth()) -
    (today.getDate() < dob.getDate() ? 1 : 0);

  return `${Math.max(1, months)} ${
    months === 1 ? "month" : "months"
  }`;
  }

  const totalVisits = visits.length;
  const lastVisit = visits.length > 0 ? visits[0] : null;
  const lastRx =
  visits.find(
    v =>
      v.sub_od_sphere ||
      v.sub_os_sphere
  ) || null;

  const whatsappNumber = normalizeWhatsAppNumber(patient?.phone);

  const handleSendFeedback = async (visitId: string) => {
  if (!cid || !patient) {
    toast.error("No active clinic or patient");
    return;
  }
      if (feedbackStatus === "completed") {
    toast.info("Feedback has already been completed for this visit");
    return;
      }

  const visit = visits.find((item: any) => item.id === visitId);

  if (!visit) {
    toast.error("Visit could not be found");
    return;
  }

  if (!isPrescriptionReadyForFeedback(visit)) {
    toast.info("Complete and dispense all prescribed items before sending feedback");
    return;
  }

  setSendingFeedback(true);

  try {
    const { data, error } = await apiClient.rpc(
      "create_feedback_request",
      {
        p_visit_id: visitId,
      }
    );

    if (error) {
      console.error("Feedback request error:", error);
      toast.error(error.message || "Could not create feedback request");
      return;
    }

    const request = Array.isArray(data) ? data[0] : data;

    if (!request?.feedback_link) {
      toast.error("Feedback link could not be generated");
      return;
    }

    const link = request.feedback_link;

    setFeedbackLink(link);

    if (!patient.phone) {
      toast.success("Feedback link created");
      return;
    }

    const clinicName = (patient as any).clinic_name || "Our Clinic";
    const message = `${clinicName}
Patient Feedback Request

Hello ${patient.full_name},

Thank you for visiting ${clinicName}. We value your experience and would appreciate a few moments of your time to share your feedback about your recent visit.

Share your feedback:
${link}

Thank you for choosing ${clinicName}.

Powered by OptoCare-EMR`;

    const whatsappUrl = whatsappLink(patient.phone, message);
    window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );

    toast.success("Feedback link ready to send on WhatsApp");
  } catch (err: any) {
    console.error("Feedback error:", err);
    toast.error(err?.message || "Could not send feedback request");
  } finally {
    setSendingFeedback(false);
  }
};
  
  const hmoEntry = patient.active_hmo_id ? hmoMap.get(patient.active_hmo_id) : null;
  const isHmo = patient.payment_type === "hmo";
  const hmoName = hmoEntry?.name || null;
  const hmoWebsite = hmoEntry?.website || null;
  const paymentSummary = getPaymentStatus(paymentHistory, patient.payment_type);

  console.log("Current editingVisitId:", editingVisitId);

  return (
    <>
      <Link to="/patients" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={12} /> Back
      </Link>

      <div className="
mb-5
rounded-3xl
border
bg-gradient-to-r
from-primary/5
to-accent/5
p-5
shadow-sm
">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
  className="
  w-14
  h-14
  rounded-2xl
  flex
  items-center
  justify-center
  text-white
  shadow-md
  shrink-0
  "
  style={{
    background:
      "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)"
  }}
>
  <span className="text-lg font-bold text-white">
    {(patient.full_name || "?")[0]}
  </span>
</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold">{patient.full_name}</h1>
                {patient.patient_number && <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-md">{patient.patient_number}</span>}
                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-md">#{patient.queue_number}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium uppercase ${isHmo ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}>
                  {isHmo ? (hmoName || "HMO") : "Private"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
  {patient.gender},{getCurrentPatientAge(patient.date_of_birth, patient.age)}• {patient.phone}
</p>

              <div className="flex flex-wrap gap-2 mt-2">
  <PatientWhatsAppMessages
    clinicId={cid || ""}
    clinicName={(patient as any).clinic_name || "Our Clinic"}
    patientId={patient.id}
    patientName={patient.full_name}
    phone={patient.phone}
  />
  <span className="text-[10px] px-2 py-1 rounded-full bg-muted">
    Queue #{patient.queue_number}
  </span>

  <span className="text-[10px] px-2 py-1 rounded-full bg-muted">
    {totalVisits} Visits
  </span>

  {lastVisit && (
    <span className="text-[10px] px-2 py-1 rounded-full bg-muted">
      Last Visit{" "}
      {new Date(
        lastVisit.created_at
      ).toLocaleDateString()}
    </span>
  )}
                {canViewFinancials && (
                  <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${getPaymentStatusClass(paymentSummary.paymentStatus)}`}>
                    Payment: {paymentSummary.paymentStatus}
                  </span>
                )}
</div>

{isHmo && patient.enrollee_number && (
  <p className="text-xs text-accent font-medium mt-1">
    Enrollee No: {patient.enrollee_number}
  </p>
)}
              {isHmo &&
  patient.hmo_coverage_type ===
    "dependent" && (
    <p className="text-[11px] text-muted-foreground mt-1">
      Dependent HMO
    </p>
)}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {patient.phone && (
              <>
                <a href={`tel:${patient.phone}`} className="
w-10
h-10
rounded-full
bg-green-50
flex
items-center
justify-center
hover:bg-green-100
transition-colors
"><Phone size={14} className="text-success" /></a>
                <a
  href={`https://wa.me/${whatsappNumber}`}
  target="_blank"
  rel="noopener noreferrer"
  className="
  w-10
  h-10
  rounded-full
  bg-green-50
  flex
  items-center
  justify-center
  hover:bg-green-100
  transition-colors
"
>
  <MessageCircle
    size={14}
    className="text-success"
  />
</a>
              </>
            )}
            
            <DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      className="rounded-xl"
    >
      <MoreVertical size={18} />
    </Button>
  </DropdownMenuTrigger>

  <DropdownMenuContent align="end">

    <DropdownMenuItem
      onClick={() => {
        setEditing(true);

        setEditForm({
          ...patient,
          hmo_coverage_type:
            patient.hmo_coverage_type || "principal",
          hmo_principal_name:
            (patient as any).hmo_principal_name || "",
          hmo_relationship:
            (patient as any).hmo_relationship || "",
        });
      }}
    >
      <Pencil className="mr-2 h-4 w-4" />
      Edit Patient
    </DropdownMenuItem>

    <DropdownMenuItem>
      <Download className="mr-2 h-4 w-4" />
      Export Record
    </DropdownMenuItem>

    <DropdownMenuItem>
      <Archive className="mr-2 h-4 w-4" />
      Archive Patient
      
    </DropdownMenuItem>
    {editingVisitId && (
  <>
    <DropdownMenuSeparator />

    <DropdownMenuItem
      className="text-red-600"
      onClick={async () => {
        const confirmed = await confirmDestructiveAction({ item: "this completed visit", details: "Clinical records should only be removed deliberately. If you only want it out of active work, use Archive instead.", highRisk: true });

        if (!confirmed) return;

        const { data: deletedVisit, error } = await apiClient
          .from("visits")
          .delete()
          .eq("clinic_id", cid)
          .eq("id", editingVisitId)
          .select("id");

        if (error) {
          toast.error(error.message);
          return;
        }

        if (!deletedVisit || deletedVisit.length === 0) {
          toast.error("The visit was not deleted. You may not have permission to delete it.");
          return;
        }

        toast.success("Visit deleted permanently");

        setVisits(prev =>
          prev.filter(v => v.id !== editingVisitId)
        );

        setEditingVisitId(null);
        setForm(emptyVisitForm());
      }}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Delete Visit
    </DropdownMenuItem>
  </>
)}

    {(role === "admin" ||
      role === "super_admin") && (
      <>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-red-600"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Patient
        </DropdownMenuItem>
      </>
    )}
  </DropdownMenuContent>
</DropdownMenu>
          </div>
        </div>
      </div>

      {isHmo && cid && (
        <div className="mb-5">
          <HMOVerificationCard
            patientId={patient.id}
            clinicId={cid}
            hmoId={patient.active_hmo_id}
            hmoName={hmoName}
            hmoWebsite={hmoWebsite}
            enrolleeNumber={patient.enrollee_number}
            status={((patient as any).hmo_verification_status as HmoVerifStatus) || "pending"}
            verifiedAt={(patient as any).hmo_verified_at}
            notes={(patient as any).hmo_verification_notes}
            onUpdated={(next) => setPatient(p => p ? ({
              ...p,
              hmo_verification_status: next.status,
              hmo_verified_at: next.verifiedAt,
              hmo_verification_notes: next.notes,
            } as any) : p)}
          />
        </div>
      )}


      {editing && (
        <div className="form-section mb-5 border-2 border-primary/20">
          <h2 className="section-title text-sm mb-3">Edit Patient</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Name</Label><Input className="rounded-xl" value={editForm.full_name || ""} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Age</Label><Input className="rounded-xl" type="number" value={editForm.age ?? ""} onChange={e => setEditForm(f => ({ ...f, age: parseInt(e.target.value) || null }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Gender</Label>
                <Select value={editForm.gender || ""} onValueChange={v => setEditForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Phone</Label><Input className="rounded-xl" value={editForm.phone || ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Next of Kin</Label><Input className="rounded-xl" value={editForm.next_of_kin || ""} onChange={e => setEditForm(f => ({ ...f, next_of_kin: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Payment Type</Label>
              <Select value={editForm.payment_type || "private"} onValueChange={v => setEditForm(f => ({ ...f, payment_type: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="hmo">HMO</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Changes are tracked in HMO history.</p>
            </div>
            {editForm.payment_type === "hmo" && (
          <>
              <div className="space-y-1"><Label className="text-xs">HMO Provider</Label>
                <Select value={editForm.active_hmo_id || ""} onValueChange={v => setEditForm(f => ({ ...f, active_hmo_id: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select HMO" /></SelectTrigger>
                  <SelectContent>{hmos.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Enrollee Number</Label>
                <Input
                  className="rounded-xl"
                  placeholder="Current/valid enrollee number"
                  value={editForm.enrollee_number || ""}
                  onChange={e =>
                    setEditForm(f => ({ ...f, enrollee_number: e.target.value }))
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  Update this if the patient's HMO enrollee number has changed.
                </p>
              </div>
          
          
              <div className="space-y-1">
  <Label className="text-xs">
    Using another person's HMO?
  </Label>

  <Select
    value={
      editForm.hmo_coverage_type ||
      "principal"
    }
    onValueChange={v =>
      setEditForm(f => ({
        ...f,
        hmo_coverage_type: v,
      }))
    }
  >
    <SelectTrigger className="rounded-xl">
      <SelectValue />
    </SelectTrigger>

    <SelectContent>
      <SelectItem value="principal">
        No
      </SelectItem>

      <SelectItem value="dependent">
        Yes
      </SelectItem>
    </SelectContent>
  </Select>
</div>
{editForm.hmo_coverage_type === "dependent" && (
  <>
    <div className="space-y-1">
      <Label className="text-xs">
        Principal Name
      </Label>

      <Input
        className="rounded-xl"
        value={editForm.hmo_principal_name || ""}
        onChange={e =>
          setEditForm(f => ({
            ...f,
            hmo_principal_name: e.target.value,
          }))
        }
      />
    </div>

    <div className="space-y-1">
      <Label className="text-xs">
        Relationship
      </Label>

      <Input
        className="rounded-xl"
        value={editForm.hmo_relationship || ""}
        onChange={e =>
          setEditForm(f => ({
            ...f,
            hmo_relationship: e.target.value,
          }))
        }
      />
    </div>
  </>
)}
       </>
          
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" className="rounded-xl" onClick={handleEditPatient}>Save</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {editingVisitId && (
  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="font-semibold text-amber-900">
        Editing Visit •{" "}
        {new Date(
          visits.find(v => v.id === editingVisitId)?.created_at || ""
        ).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      <p className="text-sm text-amber-700">
        Changes will update the existing visit record.
      </p>
    </div>

    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        setEditingVisitId(null);
        setForm(emptyVisitForm());
      }}
    >
      Cancel
    </Button>
  </div>
</div>
)}

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList
className="
optocare-clinical-tabs
sticky
top-14
z-30
w-full
flex
overflow-x-auto
rounded-2xl
border
backdrop-blur
p-1
shadow-sm
"
>
          {!isReceptionist && (
  <>
    <TabsTrigger
      value="history"
      className="flex items-center gap-1 text-[11px] rounded-xl"
    >
      <ClipboardList size={12} /> History
    </TabsTrigger>

    <TabsTrigger
      value="va"
      className="flex items-center gap-1 text-[11px] rounded-xl"
    >
      <Eye size={12} /> VA
    </TabsTrigger>

    <TabsTrigger
      value="refraction"
      className="flex items-center gap-1 text-[11px] rounded-xl"
    >
      <Eye size={12} /> Refraction
    </TabsTrigger>

    <TabsTrigger
      value="exam"
      className="flex items-center gap-1 text-[11px] rounded-xl"
    >
      <Gauge size={12} /> Exam
    </TabsTrigger>

    <TabsTrigger
      value="dx"
      className="flex items-center gap-1 text-[11px] rounded-xl"
    >
      <Stethoscope size={12} /> Dx & Tx
    </TabsTrigger>
  </>
)}

<TabsTrigger
  value="visits"
  className="flex items-center gap-1 text-[11px] rounded-xl"
>
  <History size={12} />
  {isReceptionist ? "Visit History" : "Past"}
</TabsTrigger>

{canViewFinancials && (
  <TabsTrigger
    value="payments"
    className="flex items-center gap-1 text-[11px] rounded-xl"
  >
    <FileText size={12} /> Payment History
  </TabsTrigger>
)}
        </TabsList>
        
         {!isReceptionist && (
        <TabsContent value="history" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><ClipboardList size={16} /> Case History</h2>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">Chief Complaint</Label>

    <QuickPicker
      options={CHIEF_COMPLAINT_OPTIONS}
      multi
      searchable
      triggerLabel="+ Quick Phrases"
      currentValue={form.chiefComplaint}
      onSelect={v => setField("chiefComplaint", v)}
      popoverWidthClassName="w-72"
      align="end"
    />
  </div>

  <Textarea
    className="rounded-xl"
    value={form.chiefComplaint}
    onChange={e => setField("chiefComplaint", e.target.value)}
    rows={2}
  />

  <PickerChips
    value={form.chiefComplaint}
    onChange={v => setField("chiefComplaint", v)}
  />
</div>
              <div className="space-y-1 sm:col-span-2">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">
      History (ocular, medical, family)
    </Label>

    <QuickPicker
      options={HISTORY_OPTIONS}
      multi
      searchable
      triggerLabel="+ Quick Phrases"
      currentValue={form.history}
      onSelect={v => setField("history", v)}
      popoverWidthClassName="w-72"
      align="end"
    />
  </div>

  <Textarea
    className="rounded-xl"
    value={form.history}
    onChange={e => setField("history", e.target.value)}
    rows={3}
  />

  <PickerChips
    value={form.history}
    onChange={v => setField("history", v)}
  />
</div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Old Lens Prescription</Label><Textarea className="rounded-xl" value={form.oldLensPrescription} onChange={e => setField("oldLensPrescription", e.target.value)} rows={2} placeholder="e.g. OD -2.00/-0.50x180  OS -1.75/-0.75x10" /></div>
            </div>
          </div>
        </TabsContent>
      )}

        {!isReceptionist && (
        <TabsContent value="va" className="space-y-4">
          {(() => {
            const vaCell = (field: keyof ReturnType<typeof emptyVisitForm>, near = false, placeholder = "6/6") => (
              <div className="space-y-1" key={field as string}>
                <div className="flex items-center gap-1 min-w-0">
                  <Input
                    className="rounded-xl text-center flex-1 min-w-[56px] text-sm px-2"
                    value={(form as any)[field] || ""}
                    onChange={e => setField(field as string, e.target.value)}
                    placeholder={placeholder}
                    aria-label={field as string}
                  />
                  <QuickPicker
                    options={near ? VA_NEAR_OPTIONS : VA_DISTANCE_OPTIONS}
                    triggerLabel="VA"
                    currentValue={(form as any)[field] || ""}
                    onSelect={v => setField(field as string, v)}
                    popoverWidthClassName="w-44"
                  />
                </div>
              </div>
            );
            return (
              <>
                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity — Unaided</h2>
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <div />
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold">OD</Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold">OS</Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold">OU</Label>

                    <Label className="text-xs flex items-center font-semibold">Distance</Label>
                    {vaCell("vaUnaidedOd")}
                    {vaCell("vaUnaidedOs")}
                    {vaCell("vaUnaidedOu")}

                    <Label className="text-xs flex items-center font-semibold">Pinhole</Label>
                    {vaCell("vaUnaidedOdPh")}
                    {vaCell("vaUnaidedOsPh")}
                    <div />

                    <Label className="text-xs flex items-center font-semibold">Near VA (OU)</Label>
                    <div className="col-span-3">{vaCell("vaUnaidedNearOu", true, "N6")}</div>
                  </div>
                </div>

                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Visual Acuity — Aided</h2>
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <div />
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OD</AbbrTip></Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OS</AbbrTip></Label>
                    <Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OU</AbbrTip></Label>

                    <Label className="text-xs flex items-center font-semibold">Distance</Label>
                    {vaCell("vaAidedOd")}
                    {vaCell("vaAidedOs")}
                    {vaCell("vaAidedOu")}

                    <Label className="text-xs flex items-center font-semibold">Near VA (OU)</Label>
                    <div className="col-span-3">{vaCell("vaAidedNearOu", true, "N6")}</div>
                  </div>
                </div>
              </>
            );
          })()}
        </TabsContent>
      )}

        {!isReceptionist && (
        <TabsContent value="refraction" className="space-y-4">
          {(() => {
            type Kind = "sphere" | "cyl" | "axis" | "add";
            const optsFor = (k: Kind) =>
              k === "sphere" ? SPHERE_OPTIONS :
              k === "cyl" ? CYL_OPTIONS :
              k === "axis" ? AXIS_OPTIONS :
              ADD_OPTIONS;

            const powerCell = (field: keyof ReturnType<typeof emptyVisitForm>, kind: Kind, placeholder: string) => (
              <div className="flex items-center gap-0.5" key={field as string}>
                <Input
                  className="rounded-xl text-center flex-1 min-w-[64px] text-sm px-2"
                  value={(form as any)[field] || ""}
                  onChange={e => setField(field as string, e.target.value)}
                  placeholder={placeholder}
                  aria-label={field as string}
                />
                <QuickPicker
                  options={optsFor(kind)}
                  searchable
                  triggerLabel="▾"
                  triggerClassName="px-1 h-9"
                  currentValue={(form as any)[field] || ""}
                  onSelect={v => setField(field as string, v)}
                  popoverWidthClassName="w-40"
                />
              </div>
            );
            const vaInline = (field: string, near = false) => (
              <div className="flex items-center gap-0.5">
                <Input
                  className="rounded-xl text-center flex-1 min-w-[64px] text-sm px-2"
                  value={(form as any)[field] || ""}
                  onChange={e => setField(field, e.target.value)}
                  placeholder={near ? "N6" : "6/6"}
                  aria-label={field}
                />
                <QuickPicker
                  options={near ? VA_NEAR_OPTIONS : VA_DISTANCE_OPTIONS}
                  triggerLabel="▾"
                  triggerClassName="px-1 h-9"
                  currentValue={(form as any)[field] || ""}
                  onSelect={v => setField(field, v)}
                  popoverWidthClassName="w-40"
                />
              </div>
            );

            return (
              <>
                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Auto Refraction</h2>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <div />
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OD</AbbrTip></Label>
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OS</AbbrTip></Label>

                    <Label className="text-xs font-semibold"><AbbrTip term="Sphere">Sphere</AbbrTip></Label>
{powerCell("autoOdSphere", "sphere", "-1.00")}
{powerCell("autoOsSphere", "sphere", "-1.00")}

<Label className="text-xs font-semibold"><AbbrTip term="Cyl">Cyl</AbbrTip></Label>
{powerCell("autoOdCyl", "cyl", "-0.50")}
{powerCell("autoOsCyl", "cyl", "-0.50")}

<Label className="text-xs font-semibold"><AbbrTip term="Axis">Axis</AbbrTip></Label>
{powerCell("autoOdAxis", "axis", "180")}
{powerCell("autoOsAxis", "axis", "180")}

<Label className="text-xs font-semibold"><AbbrTip term="VA">VA</AbbrTip></Label>
{vaInline("autoVaOd")}
{vaInline("autoVaOs")}
                </div>
                </div>
                
                <div className="form-section">
                  <h2 className="section-title text-sm"><Eye size={16} /> Subjective Refraction</h2>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    
                  <div />
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OD</AbbrTip></Label>
<Label className="text-[10px] text-center text-muted-foreground font-semibold"><AbbrTip>OS</AbbrTip></Label>
                    <Label className="text-xs font-semibold"><AbbrTip term="Sphere">Sphere</AbbrTip></Label>
{powerCell("subOdSphere", "sphere", "-1.00")}
{powerCell("subOsSphere", "sphere", "-1.00")}

<Label className="text-xs font-semibold"><AbbrTip term="Cyl">Cyl</AbbrTip></Label>
{powerCell("subOdCyl", "cyl", "-0.50")}
{powerCell("subOsCyl", "cyl", "-0.50")}

<Label className="text-xs font-semibold"><AbbrTip term="Axis">Axis</AbbrTip></Label>
{powerCell("subOdAxis", "axis", "180")}
{powerCell("subOsAxis", "axis", "180")}

<Label className="text-xs font-semibold"><AbbrTip term="VA">VA</AbbrTip></Label>
{vaInline("subVaOd")}
{vaInline("subVaOs")}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Reading ADD</Label>
                      <div className="flex items-center gap-1">
                        <Input className="rounded-xl flex-1" value={form.subReadingAdd} onChange={e => setField("subReadingAdd", e.target.value)} placeholder="+1.50" />
                        <QuickPicker options={ADD_OPTIONS} searchable triggerLabel="▾" onSelect={v => setField("subReadingAdd", v)} popoverWidthClassName="w-40" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">VA Outcome (Near)</Label>
                      {vaInline("subVaOutcome", true)}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </TabsContent>
      )}


        {!isReceptionist && (
        <TabsContent value="exam" className="space-y-4">
          <div className="form-section">
            <h2 className="section-title text-sm"><Gauge size={16} /> Examination</h2>
            <div className="space-y-3">
              <div className="space-y-1">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">Examination findings</Label>

    <QuickPicker
      options={EXAM_OPTIONS}
      multi
      searchable
      triggerLabel="+ Quick Phrases"
      currentValue={form.examination}
      onSelect={v => setField("examination", v)}
      popoverWidthClassName="w-72"
      align="end"
    />
  </div>

  <Textarea
    className="rounded-xl"
    value={form.examination}
    onChange={e => setField("examination", e.target.value)}
    rows={4}
    placeholder="External, anterior segment, posterior segment..."
  />

  <PickerChips
    value={form.examination}
    onChange={v => setField("examination", v)}
  />
</div>
              <div className="space-y-3">
                <div className="space-y-1 max-w-xs">
                  <Label className="text-xs">IOP — Time</Label>
                  <Input className="rounded-xl" type="time" value={form.iopTime} onChange={e => setField("iopTime", e.target.value)} aria-label="IOP time (shared)" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Right Eye (OD)</Label>
                    <Input
                      className="rounded-xl"
                      type="number"
                      inputMode="decimal"
                      value={form.iopOd}
                      onChange={e => {
                        const v = e.target.value;
                        setForm(f => ({
                          ...f,
                          iopOd: v,
                          iopTime: v && !f.iopTime ? new Date().toTimeString().slice(0, 5) : f.iopTime,
                        }));
                      }}
                      placeholder="18 mmHg"
                      aria-label="IOP OD mmHg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Left Eye (OS)</Label>
                    <Input
                      className="rounded-xl"
                      type="number"
                      inputMode="decimal"
                      value={form.iopOs}
                      onChange={e => {
                        const v = e.target.value;
                        setForm(f => ({
                          ...f,
                          iopOs: v,
                          iopTime: v && !f.iopTime ? new Date().toTimeString().slice(0, 5) : f.iopTime,
                        }));
                      }}
                      placeholder="16 mmHg"
                      aria-label="IOP OS mmHg"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      )}

        {!isReceptionist && (
        <TabsContent value="dx" className="space-y-4">
          <div className="form-section">
            <div className="flex items-center justify-between gap-2 flex-wrap"><h2 className="section-title text-sm"><Stethoscope size={16} /> Diagnosis & Management</h2>{isClinicalUser && <ClinicalAiAssistant clinicalCase={{ age: patient?.age, gender: patient?.gender, chiefComplaint: form.chiefComplaint, history: form.history, oldLensPrescription: form.oldLensPrescription, vaUnaidedOd: form.vaUnaidedOd, vaUnaidedOs: form.vaUnaidedOs, vaUnaidedOu: form.vaUnaidedOu, vaAidedOd: form.vaAidedOd, vaAidedOs: form.vaAidedOs, vaAidedOu: form.vaAidedOu, autoOdSphere: form.autoOdSphere, autoOdCyl: form.autoOdCyl, autoOdAxis: form.autoOdAxis, autoOsSphere: form.autoOsSphere, autoOsCyl: form.autoOsCyl, autoOsAxis: form.autoOsAxis, subOdSphere: form.subOdSphere, subOdCyl: form.subOdCyl, subOdAxis: form.subOdAxis, subVaOd: form.subVaOd, subOsSphere: form.subOsSphere, subOsCyl: form.subOsCyl, subOsAxis: form.subOsAxis, subVaOs: form.subVaOs, subReadingAdd: form.subReadingAdd, examination: form.examination, iopOd: form.iopOd, iopOs: form.iopOs, diagnosis: form.diagnosis, lensType: form.lensType, medication: form.medication, notes: form.notes, previousVisits: visits.filter((visit: any) => visit.id !== editingVisitId).slice(0, 8) }} />}</div>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-xs">Diagnosis</Label>
                  <div className="flex items-center gap-1">
                    <QuickPicker
                      options={REFRACTIVE_ERROR_OPTIONS}
                      multi
                      triggerLabel="+ Refractive Error"
                      currentValue={form.diagnosis}
                      onSelect={merged => setField("diagnosis", merged)}
                      popoverWidthClassName="w-64"
                      align="end"
                    />
                    <QuickPicker
                      options={DIAGNOSIS_GROUPS}
                      multi
                      searchable
                      triggerLabel="+ Diagnosis"
                      currentValue={form.diagnosis}
                      onSelect={merged => setField("diagnosis", merged)}
                      popoverWidthClassName="w-72"
                      align="end"
                    />
                  </div>
                </div>
                <Textarea className="rounded-xl" value={form.diagnosis} onChange={e => setField("diagnosis", e.target.value)} rows={3} />
                <PickerChips value={form.diagnosis} onChange={v => setField("diagnosis", v)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-xs">Treatment Plan</Label>
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <QuickPicker
                      options={LENS_RECOMMENDATION_OPTIONS}
                      multi
                      searchable
                      triggerLabel="+ Glasses / Lens"
                      currentValue={form.lensType}
                      onSelect={v => setField("lensType", v)}
                      popoverWidthClassName="w-72"
                      align="end"
                    />
                    <MedicationPicker
                      items={medications}
                      onAdd={line => setField("medication", form.medication ? `${form.medication}\n${line}` : line)}
                      triggerLabel="+ Medication"
                    />
                  </div>
                </div>
                <Textarea
                className="rounded-xl"
                value={form.lensType}
                onChange={e => setField("lensType", e.target.value)}
                rows={2}
              />
                <Textarea
  className="rounded-xl mt-2"
  value={form.medication}
  onChange={e => setField("medication", e.target.value)}
  rows={2}
  placeholder="Medication"
/>
              </div>


              <div className="space-y-1">
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <Label className="text-xs">Notes / Advice / Referral</Label>

    <div className="flex items-center gap-1">
      <QuickPicker
        options={ADVICE_OPTIONS}
        multi
        triggerLabel="+ Advice"
        currentValue={form.notes}
        onSelect={merged => setField("notes", merged)}
        popoverWidthClassName="w-64"
        align="end"
      />

      <QuickPicker
        options={REFERRAL_OPTIONS}
        multi
        triggerLabel="+ Referral"
        currentValue={form.notes}
        onSelect={merged => setField("notes", merged)}
        popoverWidthClassName="w-64"
        align="end"
      />
      {isClinicalUser && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-lg px-2 text-[10px] font-medium"
          onClick={() => {
            setAppointmentType("Follow-up");
            setAppointmentReason("Follow-up");
            setAppointmentDate("");
            setAppointmentTime("");
            setAppointmentCreated(false);
            setShowAppointmentBooking(true);
          }}
          title="Book a follow-up, advice or referral appointment"
        >
          <CalendarPlus size={12} className="mr-1" />
          Book appointment
        </Button>
      )}
    </div>
  </div>

  <Textarea
    className="rounded-xl"
    value={form.notes}
    onChange={e => setField("notes", e.target.value)}
    rows={3}
  />

  <PickerChips
    value={form.notes}
    onChange={v => setField("notes", v)}
  />
</div>

</div>
</div>
</TabsContent>
      )}
        
         <TabsContent value="visits">
          <div className="medical-card">
            <h2 className="section-title text-sm mb-4"><History size={16} /> Visit History</h2>
            {visits.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No previous visits recorded.</p>
            ) : (
              <div className="space-y-2">
                {visits.map((v: any) => (
                  <div key={v.id} className="relative pl-8 pb-6">

  <div className="absolute left-3 top-2 h-4 w-4 rounded-full bg-primary" />

  <div className="absolute left-5 top-6 bottom-0 w-px bg-border" />

  <div
  className="
  rounded-3xl
  border
  bg-card
  p-4
  shadow-sm
  hover:shadow-md
  transition-all
  duration-200
  "
>

    <div className="flex items-center justify-between">

      <div>
        <p className="font-bold text-base">
  {new Date(v.created_at).toLocaleDateString()}
</p>

        {(patientRegistrarName || v.registered_by) && (
  <p className="text-xs text-muted-foreground mt-1">
    Registered by: <span className="font-medium text-foreground">
      {patientRegistrarName || registrarMap.get(v.registered_by) || "Not recorded"}
    </span>
  </p>
)}

        {v.doctor_id && doctorMap.get(v.doctor_id) && (
  <p className="text-xs text-muted-foreground mt-1">
    Doctor: <span className="font-medium text-foreground">
      {doctorMap.get(v.doctor_id)}
    </span>
  </p>
)}

{patient.date_of_birth && (
  <p className="text-xs text-muted-foreground mt-1">
    Age at visit:{" "}
    {(() => {
      const dob = new Date(patient.date_of_birth);
      const visitDate = new Date(v.created_at);

      if (
        Number.isNaN(dob.getTime()) ||
        Number.isNaN(visitDate.getTime()) ||
        visitDate < dob
      ) {
        return "—";
      }

      let years = visitDate.getFullYear() - dob.getFullYear();
      const monthDifference =
        visitDate.getMonth() - dob.getMonth();

      if (
        monthDifference < 0 ||
        (monthDifference === 0 &&
          visitDate.getDate() < dob.getDate())
      ) {
        years--;
      }

      if (years >= 1) {
        return `${years} ${years === 1 ? "year" : "years"}`;
      }

      const differenceInDays = Math.floor(
        (visitDate.getTime() - dob.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (differenceInDays < 7) {
        return `${differenceInDays} ${
          differenceInDays === 1 ? "day" : "days"
        }`;
      }

      if (differenceInDays < 30) {
        const weeks = Math.floor(differenceInDays / 7);
        return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
      }

      const months =
        (visitDate.getFullYear() - dob.getFullYear()) * 12 +
        (visitDate.getMonth() - dob.getMonth()) -
        (visitDate.getDate() < dob.getDate() ? 1 : 0);

      return `${Math.max(1, months)} ${
        months === 1 ? "month" : "months"
      }`;
    })()}
  </p>
)}

        {v.diagnosis && (
  <div className="mt-1">
    <span
      className="
      inline-flex
      px-2
      py-1
      rounded-full
      text-[11px]
      bg-primary/10
      text-primary
      "
    >
      {v.diagnosis}
    </span>
  </div>
)}
      </div>

      <span
  className={`text-[11px] px-3 py-1 rounded-full font-medium ${
    v.status === "completed"
      ? "bg-green-100 text-green-700"
      : "bg-amber-100 text-amber-700"
  }`}
>
  {v.status === "completed"
    ? "Completed"
    : "Open"}
</span>

    </div>

    <pre className="text-[10px] overflow-auto">
      </pre>
  
    <div className="mt-3 text-xs space-y-2">

  {v.chief_complaint && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-sky-600">
  <ClipboardList size={14} />
  CC
</div> {v.chief_complaint}
    </p>
  )}

  {v.history && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-amber-600">
  <History size={14} />
  History
</div> {v.history}
    </p>
  )}

  {(v.va_unaided_od || v.va_unaided_os) && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-indigo-600">
  <Eye size={14} />
  Visual Acuity
</div>
      {" "}
      UA OD: {v.va_unaided_od || "—"}
      {" | "}
      UA OS: {v.va_unaided_os || "—"}
    </p>
  )}

  {(v.iop_od || v.iop_os) && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-red-500">
  <Gauge size={14} />
  IOP
</div>
      {" "}
      OD {v.iop_od || "—"} mmHg
      {" | "}
      OS {v.iop_os || "—"} mmHg
    </p>
  )}

  {v.examination && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-sky-600">
  <Eye size={14} />
  Examination
</div>
      {" "}
      {v.examination}
    </p>
  )}

  {v.diagnosis && (
    <p>
      <div className="flex items-center gap-2 font-semibold text-red-500">
  <Stethoscope size={14} />
  Diagnosis
</div>
      {" "}
      {v.diagnosis}
    </p>
  )}

  {(
  v.sub_od_sphere ||
  v.sub_od_cyl ||
  v.sub_od_axis ||
  v.sub_os_sphere ||
  v.sub_os_cyl ||
  v.sub_os_axis ||
  v.sub_reading_add
) && (
        <div className="rounded-xl bg-primary/5 p-3">
      <div className="flex items-center gap-2 font-medium text-indigo-600 mb-2">
        <Eye size={14} />
        Subjective Refraction
      </div>

      {(eyeHasRx(v.sub_od_sphere, v.sub_od_cyl, v.sub_od_axis) ||
        eyeHasRx(v.sub_os_sphere, v.sub_os_cyl, v.sub_os_axis)) &&
        (sameEyeRx(v) ? (
          <p className="font-mono text-sm">
            OU {fmtEyeRx(v.sub_od_sphere, v.sub_od_cyl, v.sub_od_axis)}
          </p>
        ) : (
          <>
            {eyeHasRx(v.sub_od_sphere, v.sub_od_cyl, v.sub_od_axis) && (
              <p className="font-mono text-sm">
                OD {fmtEyeRx(v.sub_od_sphere, v.sub_od_cyl, v.sub_od_axis)}
              </p>
            )}
            {eyeHasRx(v.sub_os_sphere, v.sub_os_cyl, v.sub_os_axis) && (
              <p className="font-mono text-sm">
                OS {fmtEyeRx(v.sub_os_sphere, v.sub_os_cyl, v.sub_os_axis)}
              </p>
            )}
          </>
        ))}

      {v.sub_reading_add && (
        <p className="font-mono text-sm">
          ADD {v.sub_reading_add}
        </p>
      )}

      {hasOpticalPrescription(v) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-[11px] leading-tight text-muted-foreground">
            {v.lens_type}
          </p>

          {v.optical_dispensed ? (
            <span className="shrink-0 inline-flex h-7 items-center rounded-lg bg-green-100 px-2 text-[10px] font-medium text-green-700">
              ✅️ Dispensed
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded-lg px-2 text-[10px] font-medium"
              onClick={() => handleMarkDispensed(v.id, "optical")}
              title="Dispense optical prescription"
            >
              ✔️ Dispense
            </Button>
          )}
        </div>
      )}
    </div>
  )}

  {(v.medication || v.notes) && (
    <div>
      <div className="flex items-center gap-2 font-semibold text-green-600">
        <FileText size={14} />
        Management Plan
      </div>

      {v.medication && (
        <div className="mt-2 space-y-1.5">
          {parseMedicationItems(v.medication).map((medicationItem) => {
            const medicationKey = `${v.id}:${medicationItem.name.toLowerCase()}`;
            const dispensing = medicationDispensingMap[medicationKey];
            const isDispensed = dispensing?.dispensed ?? false;

            return (
              <div
                key={`${v.id}-${medicationItem.name}`}
                className="flex items-center justify-between gap-2"
              >
                <p className="min-w-0 flex-1 text-[11px] leading-tight font-medium">
                  {medicationItem.prescribedText}
                </p>

                {isDispensed ? (
                  <span className="shrink-0 inline-flex h-7 items-center rounded-lg bg-green-100 px-2 text-[10px] font-medium text-green-700">
                    ✅️ Dispensed
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 rounded-lg px-2 text-[10px] font-medium"
                    onClick={() =>
                      handleMarkMedicationDispensed(
                        v.id,
                        medicationItem.name
                      )
                    }
                    title={`Dispense medication: ${medicationItem.name}`}
                  >
                    ✔️ Dispense
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {v.notes && (
        <p className="mt-2 text-[11px] leading-tight">
          • {v.notes}
        </p>
      )}
    </div>
  )}

</div>

    {feedbackDetails[v.id] && (
  <details
    className="mt-2 rounded-xl border bg-muted/30 px-3 py-2 group"
    title="View feedback report"
  >
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-primary">
      <span className="flex items-center gap-1.5">
        <MessageCircle size={14} /> Feedback Report
      </span>
      <span className="text-[10px] px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
        Completed
      </span>
    </summary>

    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">

      <div>
        <p className="text-muted-foreground">Overall Experience</p>
        <p className="font-semibold">
          {feedbackDetails[v.id].overall_rating}/5
        </p>
      </div>

      <div>
        <p className="text-muted-foreground">Cleanliness & Comfort</p>
        <p className="font-semibold">
          {feedbackDetails[v.id].cleanliness_rating}/5
        </p>
      </div>

      <div>
        <p className="text-muted-foreground">Front Desk</p>
        <p className="font-semibold">
          {feedbackDetails[v.id].front_desk_rating}/5
        </p>
      </div>

      <div>
        <p className="text-muted-foreground">Doctor Professionalism</p>
        <p className="font-semibold">
          {feedbackDetails[v.id].doctor_professionalism_rating}/5
        </p>
      </div>

      <div>
        <p className="text-muted-foreground">Prescription Explanation</p>
        <p className="font-semibold">
          {feedbackDetails[v.id].prescription_explanation_satisfaction}/5
        </p>
      </div>

      {!feedbackDetails[v.id].glasses_vision_not_applicable && (
        <div>
          <p className="text-muted-foreground">Glasses Vision</p>
          <p className="font-semibold">
            {feedbackDetails[v.id].glasses_vision_satisfaction}/5
          </p>
        </div>
      )}

      {!feedbackDetails[v.id].optical_service_not_applicable && (
        <div>
          <p className="text-muted-foreground">Optical Service</p>
          <p className="font-semibold">
            {feedbackDetails[v.id].optical_service_rating}/5
          </p>
        </div>
      )}

      {!feedbackDetails[v.id].glasses_fitting_not_applicable && (
        <div>
          <p className="text-muted-foreground">Glasses Fitting</p>
          <p className="font-semibold">
            {feedbackDetails[v.id].glasses_fitting_satisfaction}/5
          </p>
        </div>
      )}

      <div>
        <p className="text-muted-foreground">Recommendation</p>
        <p className="font-semibold">
          {feedbackDetails[v.id].recommendation_score}/10
        </p>
      </div>

      <div>
        <p className="text-muted-foreground">Follow-up Requested</p>
        <p className={`font-semibold ${
          feedbackDetails[v.id].wants_follow_up
            ? "text-red-600"
            : "text-green-600"
        }`}>
          {feedbackDetails[v.id].wants_follow_up ? "Yes" : "No"}
        </p>
      </div>

    </div>

    {feedbackDetails[v.id].doctor_explanation_clarity && (
      <div className="mt-3">
        <p className="text-xs text-muted-foreground">
          Doctor Explanation
        </p>
        <p className="text-xs font-medium">
          {feedbackDetails[v.id].doctor_explanation_clarity}
        </p>
      </div>
    )}

    {feedbackDetails[v.id].concerns_addressed && (
      <div className="mt-3">
        <p className="text-xs text-muted-foreground">
          Concerns Addressed
        </p>
        <p className="text-xs font-medium">
          {feedbackDetails[v.id].concerns_addressed}
        </p>
      </div>
    )}

    {feedbackDetails[v.id].prescription_difficulty && (
      <div className="mt-3 rounded-xl bg-amber-50 p-3">
        <p className="text-xs font-semibold text-amber-800">
          Prescription Difficulty
        </p>

        {feedbackDetails[v.id].prescription_difficulty_details && (
          <p className="text-xs text-amber-700 mt-1">
            {feedbackDetails[v.id].prescription_difficulty_details}
          </p>
        )}
      </div>
    )}

    {feedbackDetails[v.id].what_did_well && (
      <div className="mt-3">
        <p className="text-xs font-semibold">
          What We Did Well
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {feedbackDetails[v.id].what_did_well}
        </p>
      </div>
    )}

    {feedbackDetails[v.id].what_can_improve && (
      <div className="mt-3">
        <p className="text-xs font-semibold">
          What We Can Improve
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {feedbackDetails[v.id].what_can_improve}
        </p>
      </div>
    )}

    {feedbackDetails[v.id].anything_else && (
      <div className="mt-3">
        <p className="text-xs font-semibold">
          Additional Comments
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {feedbackDetails[v.id].anything_else}
        </p>
      </div>
    )}

    {feedbackDetails[v.id].submitted_at && (
      <p className="text-[10px] text-muted-foreground mt-4">
        Submitted{" "}
        {new Date(
          feedbackDetails[v.id].submitted_at
        ).toLocaleString()}
      </p>
    )}
  </details>
)}

    <div className="mt-3 flex items-center gap-2">
  <PatientWhatsAppMessages
    clinicId={cid || ""}
    clinicName={(patient as any).clinic_name || "Our Clinic"}
    patientId={patient.id}
    patientName={patient.full_name}
    phone={patient.phone}
    visitId={v.id}
    feedbackLink={v.id === Object.keys(feedbackDetails).find((id) => feedbackDetails[id]?.feedback_link) ? feedbackDetails[v.id]?.feedback_link : null}
  />
  <Button
    size="sm"
    variant="outline"
    className="h-7 rounded-lg px-2 text-[10px] font-medium gap-1"
    title={
      visitFeedbackStatus[v.id] === "completed"
        ? "View feedback report"
        : !isPrescriptionReadyForFeedback(v)
          ? "Dispense all prescribed items first"
          : visitFeedbackStatus[v.id] === "pending"
            ? "Feedback sent — resend feedback to the patient"
            : "Send feedback to the patient"
    }
    onClick={() => handleSendFeedback(v.id)}
    disabled={
      sendingFeedback ||
      visitFeedbackStatus[v.id] === "completed" ||
      !isPrescriptionReadyForFeedback(v)
    }
  >
    <MessageCircle size={14} />
    {sendingFeedback
      ? "Sending..."
      : visitFeedbackStatus[v.id] === "completed"
        ? "Feedback Report"
        : "Feedback"}
  </Button>

  {isClinicalUser && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="rounded-xl" title="More visit actions">
          <MoreVertical size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => startEditVisit(v)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit Visit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => generateVisitPdf(patient, v)}>
          <Download className="mr-2 h-4 w-4" /> Export Visit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )}
</div>

  </div>

</div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
         {canViewFinancials && <TabsContent value="payments">
           <div className="medical-card">
             <div className="flex items-center justify-between gap-3 mb-4">
               <div>
                 <h2 className="section-title text-sm"><FileText size={16} /> Payment History</h2>
                 <p className="text-xs text-muted-foreground mt-1">
                   {paymentSummary.outstandingBalance > 0
                     ? `Outstanding balance: ₦${paymentSummary.outstandingBalance.toLocaleString()}`
                     : "No outstanding balance"}
                 </p>
               </div>
               <div className="flex items-center gap-2">
                 <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${getPaymentStatusClass(paymentSummary.paymentStatus)}`}>
                   {paymentSummary.paymentStatus}
                 </span>
                 <Link
                   to={"/billing?patient_id=" + patient.id}
                   className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary px-2.5 py-1.5 text-[10px] sm:text-xs font-medium text-primary-foreground hover:opacity-90"
                   title="Create or open this patient's billing"
                 >
                   <FileText size={12} /> New Bill
                 </Link>
               </div>
             </div>

             {paymentHistory.length === 0 ? (
               <div className="py-6 text-center">
                 <p className="text-sm text-muted-foreground">No payment history recorded.</p>
                 <Link
                   to={"/billing?patient_id=" + patient.id}
                   className="mt-3 inline-flex items-center gap-1 rounded-xl bg-primary px-2.5 py-1.5 text-[10px] sm:text-xs font-medium text-primary-foreground hover:opacity-90"
                 >
                   <FileText size={12} /> Create Bill
                 </Link>
               </div>
             ) : (
               <div className="space-y-4">
                 {paymentHistory.map((bill) => {
                   const visitItems = bill.items;
                   const status =
                     Number(bill.total_amount) > 0 && Number(bill.balance) <= 0
                       ? "Paid"
                       : Number(bill.amount_paid) > 0
                         ? "Partially Paid"
                         : "Not Paid";

                   return (
                     <div key={bill.id} className="rounded-2xl border bg-card overflow-hidden">
                       <div className="p-4 border-b bg-muted/20">
                         <div className="flex items-start justify-between gap-3">
                           <div>
                             <p className="font-semibold">
                               {bill.visit_date
                                 ? new Date(bill.visit_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                 : "Visit"}
                             </p>
                             <p className="text-xs text-muted-foreground mt-1">
                               {bill.visit_id ? "Visit billing" : "Billing record"} • Invoice {bill.id.slice(0, 8).toUpperCase()}
                             </p>
                           </div>
                           <span className={`shrink-0 text-[11px] px-2 py-1 rounded-md font-medium ${getPaymentStatusClass(status)}`}>
                             {status}
                           </span>
                         </div>
                       </div>

                       <div className="p-4">
                         <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                           Charges
                         </p>

                         <div className="divide-y rounded-xl border overflow-hidden">
                           {Number(bill.consultation_fee) > 0 && (
                             <div className="flex items-start justify-between gap-3 px-3 py-2.5 text-xs">
                               <div>
                                 <p className="font-medium">Consultation</p>
                                 <p className="text-[10px] text-muted-foreground">Eye examination / consultation</p>
                               </div>
                               <span className="font-medium whitespace-nowrap">₦{Number(bill.consultation_fee).toLocaleString()}</span>
                             </div>
                           )}

                           {visitItems.length > 0 ? visitItems.map((item, index) => (
                             <div key={`${bill.id}-item-${index}`} className="flex items-start justify-between gap-3 px-3 py-2.5 text-xs">
                               <div className="min-w-0">
                                 <p className="font-medium">{item.item_name}</p>
                                 <p className="text-[10px] text-muted-foreground">
                                   {item.item_type || "Item"}{item.quantity > 1 ? ` • Qty ${item.quantity}` : ""}
                                 </p>
                               </div>
                               <span className="font-medium whitespace-nowrap">₦{Number(item.total_price).toLocaleString()}</span>
                             </div>
                           )) : (
                             <div className="px-3 py-2.5 text-xs text-muted-foreground">No itemized charges recorded.</div>
                           )}

                           {Number(bill.discount_amount) > 0 && (
                             <div className="flex items-start justify-between gap-3 px-3 py-2.5 text-xs">
                               <div>
                                 <p className="font-medium">Discount</p>
                                 {bill.discount_reason && <p className="text-[10px] text-muted-foreground">{bill.discount_reason}</p>}
                               </div>
                               <span className="font-medium whitespace-nowrap">-₦{Number(bill.discount_amount).toLocaleString()}</span>
                             </div>
                           )}
                         </div>

                         <div className="grid grid-cols-3 gap-2 mt-3">
                           <div className="rounded-xl bg-muted/30 p-2.5">
                             <p className="text-[10px] text-muted-foreground">Total Charged</p>
                             <p className="font-semibold text-xs mt-1">₦{Number(bill.total_amount).toLocaleString()}</p>
                           </div>
                           <div className="rounded-xl bg-muted/30 p-2.5">
                             <p className="text-[10px] text-muted-foreground">Paid</p>
                             <p className="font-semibold text-xs mt-1">₦{Number(bill.amount_paid).toLocaleString()}</p>
                           </div>
                           <div className="rounded-xl bg-muted/30 p-2.5">
                             <p className="text-[10px] text-muted-foreground">Balance</p>
                             <p className={`font-semibold text-xs mt-1 ${Number(bill.balance) > 0 ? "text-warning" : "text-success"}`}>
                               ₦{Number(bill.balance).toLocaleString()}
                             </p>
                           </div>
                         </div>

                         {bill.payments.length > 0 && (
                           <div className="mt-4">
                             <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                               Payment Transactions
                             </p>
                             <div className="space-y-2">
                               {bill.payments.map((payment, index) => (
                                 <div key={`${bill.id}-payment-${index}`} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs">
                                   <div>
                                     <p className="font-medium">{payment.method || "Payment"}</p>
                                     <p className="text-[10px] text-muted-foreground">
                                       {new Date(payment.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                     </p>
                                   </div>
                                   <span className="font-medium">₦{Number(payment.amount).toLocaleString()}</span>
                                 </div>
                               ))}
                             </div>
                           </div>
                         )}

                         <div className="flex items-center justify-between gap-2 flex-wrap mt-4">
                           <span className="text-[10px] text-muted-foreground">
                             {bill.visit_id ? "All charges shown are attached to this visit." : "Billing record not linked to a visit."}
                           </span>
                           {bill.visit_id && (
                             <Link
                               to={"/billing?patient_id=" + patient.id + "&visit_id=" + bill.visit_id}
                               className="inline-flex items-center gap-1 rounded-xl bg-primary px-2.5 py-1.5 text-[10px] sm:text-xs font-medium text-primary-foreground hover:opacity-90"
                             >
                               <FileText size={12} /> View Bill
                             </Link>
                           )}
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}
           </div>
          </TabsContent>}
      </Tabs>

      <Dialog
        open={showAppointmentBooking}
        onOpenChange={(open) => {
          if (savingAppointment) return;
          setShowAppointmentBooking(open);
          if (!open) {
            setAppointmentCreated(false);
            setAppointmentDate("");
            setAppointmentTime("");
            setAppointmentReason("");
          }
        }}
      >
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus size={18} />
              Book appointment
            </DialogTitle>
            <DialogDescription>
              Schedule a follow-up, advice or referral appointment for this patient.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Patient
              </p>
              <p className="text-sm font-semibold mt-1">{patient.full_name}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="patient-appointment-date">Date</Label>
                <Input
                  id="patient-appointment-date"
                  type="date"
                  className="rounded-xl"
                  value={appointmentDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patient-appointment-time">Time</Label>
                <Input
                  id="patient-appointment-time"
                  type="time"
                  className="rounded-xl"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="patient-appointment-reason">Reason</Label>
              <Textarea
                id="patient-appointment-reason"
                className="rounded-xl"
                rows={3}
                value={appointmentReason}
                onChange={(e) => setAppointmentReason(e.target.value)}
                placeholder="e.g. IOP follow-up, glaucoma follow-up, advice, referral..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowAppointmentBooking(false)}
              disabled={savingAppointment}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              onClick={bookFollowUpAppointment}
              disabled={
                savingAppointment ||
                !appointmentDate ||
                !appointmentTime ||
                !selectedDoctorId
              }
            >
              {savingAppointment ? "Booking..." : "Book appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="sticky bottom-20 lg:bottom-4 mt-6 flex justify-end gap-2">
        
      {editingVisitId ? (
  <>
    <Button
      variant="destructive"
      size="lg"
      className="rounded-2xl"
      onClick={async () => {
        const confirmed = window.confirm(
          "Delete this visit permanently?"
        );

        if (!confirmed) return;

        const { error } = await apiClient
          .from("visits")
          .delete()
          .eq("id", editingVisitId);

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Visit deleted");

        setVisits(prev =>
          prev.filter(v => v.id !== editingVisitId)
        );

        setEditingVisitId(null);
        setForm(emptyVisitForm());
      }}
      >
        Delete Visit
      </Button>

      <Button
        size="lg"
        className="shadow-lg rounded-2xl px-6"
        onClick={() => handleSaveVisit(true)}
        disabled={saving}
      >
        <Pencil size={16} className="mr-1" />
        Update Visit
      </Button>
    </>
  ) : (
    <>

      <Button
        onClick={() => handleSaveVisit(true)}
        size="lg"
        className="shadow-lg rounded-2xl px-6"
        disabled={saving}
      >
        <CheckCircle2 size={16} className="mr-1" />
        Complete Visit
      </Button>
    </>
  )}
        
</div>
    </>
  );
}