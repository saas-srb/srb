/**
 * Employment lifecycle states. Mirrors the shape of
 * `src/lib/career-application-status.ts` so the shared admin badge / dot
 * styling utilities apply unchanged.
 */

export const EMPLOYEE_STATUSES = [
  { value: "probation", label: "Probation", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50", active: true },
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", active: true },
  { value: "on_leave", label: "On Leave", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70", active: true },
  { value: "notice_period", label: "Notice Period", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", active: true },
  { value: "suspended", label: "Suspended", badgeClass: "bg-destructive/10 text-destructive", dotClass: "bg-destructive/70", active: false },
  { value: "deactivated", label: "Deactivated", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/40", active: false },
  { value: "relieved", label: "Relieved", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60", active: false },
  { value: "terminated", label: "Terminated", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", active: false },
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]["value"];

export const DEFAULT_EMPLOYEE_STATUS: EmployeeStatus = "probation";

/** Statuses that count toward "Active Employees" / headcount. */
export const ACTIVE_EMPLOYEE_STATUSES: EmployeeStatus[] = EMPLOYEE_STATUSES.filter((s) => s.active).map((s) => s.value);

/** Statuses that represent someone who has left — used for attrition. */
export const EXITED_EMPLOYEE_STATUSES: EmployeeStatus[] = ["relieved", "terminated"];

export function isValidEmployeeStatus(value: string): value is EmployeeStatus {
  return EMPLOYEE_STATUSES.some((s) => s.value === value);
}

export function getEmployeeStatusMeta(status: string | undefined) {
  return EMPLOYEE_STATUSES.find((s) => s.value === status) ?? EMPLOYEE_STATUSES[0];
}

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "consultant", label: "Consultant" },
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["value"];

export function isValidEmploymentType(value: string): value is EmploymentType {
  return EMPLOYMENT_TYPES.some((t) => t.value === value);
}

export function getEmploymentTypeLabel(value: string | undefined): string {
  return EMPLOYMENT_TYPES.find((t) => t.value === value)?.label ?? "—";
}

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "undisclosed", label: "Prefer not to say" },
] as const;

export type Gender = (typeof GENDERS)[number]["value"];

export function isValidGender(value: string): value is Gender {
  return GENDERS.some((g) => g.value === value);
}

export function getGenderLabel(value: string | undefined): string {
  return GENDERS.find((g) => g.value === value)?.label ?? "—";
}

export const WORK_LOCATIONS = [
  { value: "onsite", label: "On-site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
] as const;

export function isValidWorkLocation(value: string): boolean {
  return WORK_LOCATIONS.some((w) => w.value === value);
}
