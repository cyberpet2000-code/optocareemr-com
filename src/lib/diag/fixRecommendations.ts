export function getFixRecommendation(
  issue: string
): string | null {
  switch (issue) {
    case "inventory request failed":
      return "Verify inventory schema and confirm the quantity column exists.";

    case "drugs request failed":
      return "Verify drugs schema and confirm the quantity column exists.";

    case "revenue mismatch":
      return "Ensure dashboard and billing modules use the same revenue source.";

    case "slow query":
      return "Check indexes, RLS policies, and duplicated startup requests.";

    case "missing clinic_id":
      return "Add clinic_id before saving records and validate on insert.";

    default:
      return null;
  }
}
