export interface PatientVisitSummary {
  visitCount: number;
  lastVisit: string | null;
}

export interface PatientBillingSummary {
  paymentStatus: string;
  outstandingBalance: number;
}

export function buildVisitSummaryMap(
  visits: Array<{ patient_id?: string | null; created_at?: string | null }>,
): Map<string, PatientVisitSummary> {
  const summaries = new Map<string, PatientVisitSummary>();

  visits.forEach((visit) => {
    if (!visit.patient_id) return;
    const current = summaries.get(visit.patient_id);
    const lastVisit = visit.created_at || null;

    summaries.set(visit.patient_id, {
      visitCount: (current?.visitCount || 0) + 1,
      lastVisit: !current?.lastVisit || (lastVisit && lastVisit > current.lastVisit)
        ? lastVisit
        : current.lastVisit,
    });
  });

  return summaries;
}

export function buildBillingSummaryMap(
  bills: Array<{
    patient_id?: string | null;
    total_amount?: number | null;
    balance?: number | null;
    amount_paid?: number | null;
    status?: string | null;
    payer_type?: string | null;
  }>,
  paymentTypes = new Map<string, string>(),
): Map<string, PatientBillingSummary> {
  const grouped = new Map<
    string,
    Array<{
      total_amount?: number | null;
      balance?: number | null;
      amount_paid?: number | null;
      status?: string | null;
    }>
  >();

  bills.forEach((bill) => {
    if (!bill.patient_id) return;

    const current = grouped.get(bill.patient_id) || [];
    current.push(bill);
    grouped.set(bill.patient_id, current);
  });

  const summaries = new Map<string, PatientBillingSummary>();

  grouped.forEach((patientBills, patientId) => {
    summaries.set(
      patientId,
      getPaymentStatus(
        patientBills,
        paymentTypes.get(patientId),
      ),
    );
  });

  return summaries;
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
  bills: Array<{
    total_amount?: number | null;
    balance?: number | null;
    amount_paid?: number | null;
    status?: string | null;
  }>,
  paymentType?: string | null,
): PatientBillingSummary {
  if (bills.length === 0) {
    return {
      paymentStatus: paymentType === "hmo" ? "HMO" : "No billing",
      outstandingBalance: 0,
    };
  }

  // Ignore automatic ₦0 billing shells.
  // A shell has no actual charge and no payment.
  const actualBills = bills.filter(
    (bill) =>
      Number(bill.total_amount || 0) > 0 ||
      Number(bill.amount_paid || 0) > 0,
  );

  // Patient has a visit but no actual bill yet.
  if (actualBills.length === 0) {
    return {
      paymentStatus: paymentType === "hmo" ? "HMO" : "No billing",
      outstandingBalance: 0,
    };
  }

  const outstandingBalance = actualBills.reduce(
    (total, bill) =>
      total + Math.max(Number(bill.balance || 0), 0),
    0,
  );

  const amountPaid = actualBills.reduce(
    (total, bill) =>
      total + Math.max(Number(bill.amount_paid || 0), 0),
    0,
  );

  // Actual bill with some payment but still has balance.
  if (outstandingBalance > 0 && amountPaid > 0) {
    return {
      paymentStatus:
        paymentType === "hmo" ? "HMO / Partial" : "Partial",
      outstandingBalance,
    };
  }

  // Actual bill with nothing paid.
  if (outstandingBalance > 0) {
    return {
      paymentStatus:
        paymentType === "hmo" ? "HMO / Due" : "Due",
      outstandingBalance,
    };
  }

  // Actual bill has been completely paid.
  return {
    paymentStatus:
      paymentType === "hmo" ? "HMO / Paid" : "Paid",
    outstandingBalance: 0,
  };
}
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
