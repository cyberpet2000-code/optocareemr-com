import { diag } from "./diag";

export function checkRevenueMismatch(
  billingRevenue: number,
  visitRevenue: number
) {
  const difference = Math.abs(
    billingRevenue - visitRevenue
  );

  if (difference > 1000) {
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
