export const CAREER_APPLICATION_STATUSES = [
  { value: "new", label: "New", badgeClass: "bg-secondary text-secondary-foreground", dotClass: "bg-secondary-foreground/60" },
  { value: "under_review", label: "Under Review", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "shortlisted", label: "Shortlisted", badgeClass: "bg-primary/15 text-primary", dotClass: "bg-primary" },
  { value: "interview_scheduled", label: "Interview Scheduled", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70" },
  { value: "selected", label: "Selected", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "hired", label: "Hired", badgeClass: "bg-green-600/20 text-green-700 dark:text-green-400", dotClass: "bg-green-600" },
  { value: "rejected", label: "Rejected", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
] as const;

export type CareerApplicationStatus = (typeof CAREER_APPLICATION_STATUSES)[number]["value"];

export const DEFAULT_CAREER_APPLICATION_STATUS: CareerApplicationStatus = "new";

export function isValidCareerApplicationStatus(value: string): value is CareerApplicationStatus {
  return CAREER_APPLICATION_STATUSES.some((s) => s.value === value);
}

export function getCareerApplicationStatusMeta(status: string | undefined) {
  return CAREER_APPLICATION_STATUSES.find((s) => s.value === status) ?? CAREER_APPLICATION_STATUSES[0];
}
