export function healthHint(issue: string) {
  switch (issue) {
    case "inventory request failed":
      return "Inventory query failed. Check quantity column and schema.";

    case "drugs request failed":
      return "Drugs query failed. Check quantity column and schema.";

    case "revenue mismatch":
      return "Billing revenue and visit revenue calculations disagree.";

    default:
      return null;
  }
}
