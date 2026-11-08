/** Client-safe payroll run status metadata (no I/O). */

export const PAYROLL_RUN_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-secondary/60 text-secondary-foreground" },
  { value: "approved", label: "Approved", badgeClass: "bg-primary/15 text-primary" },
  { value: "paid", label: "Paid", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400" },
] as const;

export type PayrollRunStatusValue = (typeof PAYROLL_RUN_STATUSES)[number]["value"];

export function payrollRunStatusMeta(v: string) {
  return PAYROLL_RUN_STATUSES.find((s) => s.value === v) ?? PAYROLL_RUN_STATUSES[0];
}

export function monthLabelLong(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
