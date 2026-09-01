export const EXPENSE_CATEGORIES = [
  "Salaries & Wages",
  "Rent",
  "Utilities",
  "Fuel",
  "Internet/Data",
  "Advertising & Marketing",
  "Drugs",
  "Frames",
  "Contact Lenses",
  "Lens Laboratory",
  "Repairs & Maintenance",
  "Equipment",
  "Office Supplies",
  "Taxes",
  "Bank Charges",
  "Imprest",
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export function formatMoney(n: number | null | undefined): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  return "₦" + v.toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

export function startOfMonthISO(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
export function startOfDayISO(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}
