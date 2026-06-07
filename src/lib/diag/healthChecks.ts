import { diag } from "./diag";
import { reportIssue } from "./issueTracker";

export function checkRevenueMismatch(
  billingRevenue: number,
  visitRevenue: number
) {
  const difference = Math.abs(
    billingRevenue - visitRevenue
  );

  if (difference > 1000) {
    reportIssue("revenue mismatch");
    diag.error(
      "billing",
      "revenue mismatch",
      new Error("Revenue mismatch"),
      {
        billingRevenue,
        visitRevenue,
        difference,
      }
    );
  }
}

export function checkSlowQuery(
  name: string,
  durationMs: number
) {
  if (durationMs > 1500) {
    diag.warn(
      "perf",
      "slow query",
      {
        query: name,
        durationMs,
      }
    );
  }
}

export function checkMissingClinicId(
  table: string,
  record: Record<string, any>
) {
  if (!record?.clinic_id) {
    diag.error(
      "rls",
      "missing clinic_id",
      new Error("Missing clinic_id"),
      {
        table,
        recordId: record?.id,
      }
    );
  }
}

export function checkPatientContext(
  patientId?: string | null
) {
  if (!patientId) {
    diag.warn(
      "query",
      "missing patient id"
    );
  }
}

export function checkClinicSubscription(
  subscriptionStatus?: string | null
) {
  if (
    !subscriptionStatus ||
    subscriptionStatus === "inactive" ||
    subscriptionStatus === "expired"
  ) {
    diag.warn(
      "query",
      "clinic subscription inactive",
      {
        subscriptionStatus,
      }
    );
  }
}


export function getHealthScore(entries: any[]) {
  let score = 100;

  entries.forEach((e) => {
    if (e.level === "error") score -= 20;
    if (e.level === "warn") score -= 5;
  });

  return Math.max(0, score);
}
