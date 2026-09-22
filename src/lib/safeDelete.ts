export function confirmDestructiveAction(options: { item: string; details?: string; highRisk?: boolean }): boolean {
  const details = options.details ? "\n\n" + options.details : "";
  const confirmed = window.confirm(
    "This action will permanently delete " + options.item + "." + details + "\n\nDo you want to continue?"
  );
  if (!confirmed) return false;
  if (options.highRisk) {
    const typed = window.prompt(
      "This is a high-risk deletion. Type DELETE to permanently remove " + options.item + "."
    );
    if (typed?.trim().toUpperCase() !== "DELETE") {
      window.alert("Deletion cancelled. The record was not deleted.");
      return false;
    }
  }
  return true;
}
