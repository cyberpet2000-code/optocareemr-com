export function healthHint(issue: string) {
  switch (issue) {

    case "revenue mismatch":
      return "Billing revenue and visit revenue calculations disagree.";

    default:
      return null;
  }
}
