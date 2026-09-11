import { CalendarDays, ClipboardList, CreditCard } from "lucide-react";
import {
  formatPatientDate,
  getPaymentStatusClass,
  type PatientBillingSummary,
  type PatientVisitSummary,
} from "@/lib/patientHistory";
import { useRole } from "@/hooks/useRole";

interface PatientHistoryMetaProps {
  visits: PatientVisitSummary;
  billing: PatientBillingSummary;
  compact?: boolean;
}

export default function PatientHistoryMeta({ visits, billing, compact = false }: PatientHistoryMetaProps) {
  const { isAdmin, isReceptionist } = useRole();
  const canViewPayments = isAdmin || isReceptionist;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground ${compact ? "mt-1" : "mt-2"}`}>
      <span className="inline-flex items-center gap-1">
        <ClipboardList size={12} />
        Visits: {visits.visitCount}
      </span>
      <span className="inline-flex items-center gap-1">
        <CalendarDays size={12} />
        Last: {formatPatientDate(visits.lastVisit)}
      </span>
      {canViewPayments && (
        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${getPaymentStatusClass(billing.paymentStatus)}`}>
          <CreditCard size={12} />
          {billing.paymentStatus}
        </span>
      )}
    </div>
  );
}