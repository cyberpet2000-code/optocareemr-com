export interface PatientVisitSummary {
  visitCount: number;
  lastVisit: string | null;
}

export interface PatientBillingSummary {
  paymentStatus: string;
  outstandingBalance: number;
}

export function formatPatientDate(value: string | null | undefined): string {
  if (!value) return "No visits yet";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getPaymentStatus(
  bills: Array<{ balance?: number | null; amount_paid?: number | null; status?: string | null }>,
  paymentType?: string | null,
): PatientBillingSummary {
  if (bills.length === 0) {
    return {
      paymentStatus: paymentType === "hmo" ? "HMO" : "No billing",
      outstandingBalance: 0,
    };
  }

  const outstandingBalance = bills.reduce(
    (total, bill) => total + Math.max(Number(bill.balance || 0), 0),
    0,
  );
  const amountPaid = bills.reduce(
    (total, bill) => total + Math.max(Number(bill.amount_paid || 0), 0),
    0,
  );

  if (outstandingBalance > 0 && amountPaid > 0) {
    return { paymentStatus: paymentType === "hmo" ? "HMO / Partial" : "Partial", outstandingBalance };
  }

  if (outstandingBalance > 0) {
    return { paymentStatus: paymentType === "hmo" ? "HMO / Due" : "Due", outstandingBalance };
  }

  return { paymentStatus: "Paid", outstandingBalance: 0 };
}

export function getPaymentStatusClass(status: string): string {
  if (status === "Paid") return "bg-success/10 text-success";
  if (status.includes("Due") || status === "Partial") return "bg-warning/10 text-warning";
  if (status.includes("HMO")) return "bg-accent/10 text-accent";
  return "bg-muted text-muted-foreground";
}