/**
 * Client-safe TMS constants and pure helpers. NEVER import `server-only` here —
 * this module is imported by client components (badges, forms, tables). Server
 * modules re-export from here where convenient.
 *
 * Badge/dot class shapes mirror `src/lib/sprintos/constants.ts` so the shared badge
 * styling applies unchanged.
 */

// ---------------------------------------------------------------------------
// Program category (Industrial Training vs Internship)
// ---------------------------------------------------------------------------

export const PROGRAM_CATEGORIES = [
  { value: "industrial", label: "Industrial Training", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70" },
  { value: "internship", label: "Internship Program", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
] as const;

export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number]["value"];

export const DEFAULT_PROGRAM_CATEGORY: ProgramCategory = "industrial";

export function isValidProgramCategory(value: unknown): value is ProgramCategory {
  return typeof value === "string" && PROGRAM_CATEGORIES.some((c) => c.value === value);
}

export function getProgramCategoryMeta(value: string | undefined) {
  return PROGRAM_CATEGORIES.find((c) => c.value === value) ?? PROGRAM_CATEGORIES[0];
}

// ---------------------------------------------------------------------------
// Program status
// ---------------------------------------------------------------------------

export const PROGRAM_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50", live: false },
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", live: true },
  { value: "archived", label: "Archived", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60", live: false },
] as const;

export type ProgramStatus = (typeof PROGRAM_STATUSES)[number]["value"];

export const DEFAULT_PROGRAM_STATUS: ProgramStatus = "draft";

export function isValidProgramStatus(value: unknown): value is ProgramStatus {
  return typeof value === "string" && PROGRAM_STATUSES.some((s) => s.value === value);
}

export function getProgramStatusMeta(status: string | undefined) {
  return PROGRAM_STATUSES.find((s) => s.value === status) ?? PROGRAM_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Delivery mode
// ---------------------------------------------------------------------------

export const TRAINING_MODES = [
  { value: "online", label: "Online", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "offline", label: "Offline", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "hybrid", label: "Hybrid", badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400", dotClass: "bg-purple-500" },
] as const;

export type TrainingMode = (typeof TRAINING_MODES)[number]["value"];

export const DEFAULT_TRAINING_MODE: TrainingMode = "online";

export function isValidTrainingMode(value: unknown): value is TrainingMode {
  return typeof value === "string" && TRAINING_MODES.some((m) => m.value === value);
}

export function getTrainingModeMeta(value: string | undefined) {
  return TRAINING_MODES.find((m) => m.value === value) ?? TRAINING_MODES[0];
}

// ---------------------------------------------------------------------------
// Batch status
// ---------------------------------------------------------------------------

export const BATCH_STATUSES = [
  { value: "upcoming", label: "Upcoming", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50", running: false },
  { value: "running", label: "Running", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70", running: true },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", running: false },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", running: false },
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number]["value"];

export const DEFAULT_BATCH_STATUS: BatchStatus = "upcoming";

export function isValidBatchStatus(value: unknown): value is BatchStatus {
  return typeof value === "string" && BATCH_STATUSES.some((s) => s.value === value);
}

export function getBatchStatusMeta(status: string | undefined) {
  return BATCH_STATUSES.find((s) => s.value === status) ?? BATCH_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Student lifecycle status
// ---------------------------------------------------------------------------

export const STUDENT_STATUSES = [
  { value: "active", label: "Active", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70" },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "dropped", label: "Dropped", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "on_hold", label: "On Hold", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number]["value"];

export const DEFAULT_STUDENT_STATUS: StudentStatus = "active";

export function isValidStudentStatus(value: unknown): value is StudentStatus {
  return typeof value === "string" && STUDENT_STATUSES.some((s) => s.value === value);
}

export function getStudentStatusMeta(status: string | undefined) {
  return STUDENT_STATUSES.find((s) => s.value === status) ?? STUDENT_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Class schedule status
// ---------------------------------------------------------------------------

export const CLASS_STATUSES = [
  { value: "scheduled", label: "Scheduled", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70" },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
] as const;

export type ClassStatus = (typeof CLASS_STATUSES)[number]["value"];

export function isValidClassStatus(value: unknown): value is ClassStatus {
  return typeof value === "string" && CLASS_STATUSES.some((s) => s.value === value);
}

export function getClassStatusMeta(status: string | undefined) {
  return CLASS_STATUSES.find((s) => s.value === status) ?? CLASS_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Class attendance status
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", attended: true },
  { value: "late", label: "Late", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", attended: true },
  { value: "absent", label: "Absent", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", attended: false },
  { value: "excused", label: "Excused", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", attended: true },
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];

export function isValidAttendanceStatus(v: unknown): v is AttendanceStatus {
  return typeof v === "string" && ATTENDANCE_STATUSES.some((s) => s.value === v);
}

export function getAttendanceMeta(status: string | undefined) {
  return ATTENDANCE_STATUSES.find((s) => s.value === status) ?? ATTENDANCE_STATUSES[2];
}

// ---------------------------------------------------------------------------
// Live project status
// ---------------------------------------------------------------------------

export const LIVE_PROJECT_STATUSES = [
  { value: "planned", label: "Planned", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "in_progress", label: "In Progress", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70" },
  { value: "review", label: "In Review", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
] as const;

export type LiveProjectStatus = (typeof LIVE_PROJECT_STATUSES)[number]["value"];

export function getLiveProjectStatusMeta(status: string | undefined) {
  return LIVE_PROJECT_STATUSES.find((s) => s.value === status) ?? LIVE_PROJECT_STATUSES[0];
}
export function isValidLiveProjectStatus(v: unknown): v is LiveProjectStatus {
  return typeof v === "string" && LIVE_PROJECT_STATUSES.some((s) => s.value === v);
}

// ---------------------------------------------------------------------------
// Assignment submission status
// ---------------------------------------------------------------------------

export const SUBMISSION_STATUSES = [
  { value: "pending", label: "Not Submitted", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
  { value: "submitted", label: "Submitted", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "reviewed", label: "Reviewed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "resubmit", label: "Needs Rework", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]["value"];

export function getSubmissionStatusMeta(status: string | undefined) {
  return SUBMISSION_STATUSES.find((s) => s.value === status) ?? SUBMISSION_STATUSES[0];
}
export function isValidSubmissionStatus(v: unknown): v is SubmissionStatus {
  return typeof v === "string" && SUBMISSION_STATUSES.some((s) => s.value === v);
}

// ---------------------------------------------------------------------------
// Certificate types
// ---------------------------------------------------------------------------

export const CERTIFICATE_TYPES = [
  { value: "industrial_training", label: "Industrial Training Certificate" },
  { value: "internship", label: "Internship Certificate" },
  { value: "project_completion", label: "Project Completion Certificate" },
  { value: "letter_of_recommendation", label: "Letter of Recommendation" },
  { value: "excellence", label: "Excellence Certificate" },
  { value: "experience", label: "Experience Certificate" },
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number]["value"];

export function isValidCertificateType(value: unknown): value is CertificateType {
  return typeof value === "string" && CERTIFICATE_TYPES.some((t) => t.value === value);
}

export function getCertificateTypeLabel(value: string | undefined): string {
  return CERTIFICATE_TYPES.find((t) => t.value === value)?.label ?? "Certificate";
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = ["UPI", "Bank Transfer", "Card", "Cash", "Cheque", "EMI", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ---------------------------------------------------------------------------
// Placement types
// ---------------------------------------------------------------------------

export const PLACEMENT_TYPES = [
  { value: "campus", label: "Campus Placement" },
  { value: "off_campus", label: "Off-campus" },
  { value: "internship_conversion", label: "Internship Conversion" },
  { value: "referral", label: "Referral" },
] as const;

export type PlacementType = (typeof PLACEMENT_TYPES)[number]["value"];

export function isValidPlacementType(v: unknown): v is PlacementType {
  return typeof v === "string" && PLACEMENT_TYPES.some((t) => t.value === v);
}
export function getPlacementTypeLabel(v: string | undefined): string {
  return PLACEMENT_TYPES.find((t) => t.value === v)?.label ?? "Placement";
}

// ---------------------------------------------------------------------------
// Payment status
// ---------------------------------------------------------------------------

export const PAYMENT_STATUSES = [
  { value: "unpaid", label: "Unpaid", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "partial", label: "Partial", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "paid", label: "Paid", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]["value"];

export function getPaymentStatusMeta(status: string | undefined) {
  return PAYMENT_STATUSES.find((s) => s.value === status) ?? PAYMENT_STATUSES[0];
}

/** Derives a payment status from paid / total amounts. */
export function computePaymentStatus(paid: number, total: number): PaymentStatus {
  if (total <= 0 || paid >= total) return "paid";
  if (paid <= 0) return "unpaid";
  return "partial";
}

// ---------------------------------------------------------------------------
// Defaults — overridable in TMS settings
// ---------------------------------------------------------------------------

export const DEFAULT_PROGRAM_TECHNOLOGIES = [
  "MERN Stack", "MEAN Stack", "Generative AI", "Agentic AI", "Conversational AI",
  "Computer Vision", "Data Science", "DevOps", "React Native", "Flutter",
  "Python", "Java", "Cloud (AWS)",
] as const;

export const DEFAULT_CURRENCY = "INR";

export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"] as const;

/** `{n}` → padded sequence, `{yyyy}` → year. e.g. "YO-TMS-{yyyy}-{n}". */
export const DEFAULT_CERTIFICATE_NUMBER_FORMAT = "YO-Cohort AI-{yyyy}-{n}";

// ---------------------------------------------------------------------------
// Generic label helper
// ---------------------------------------------------------------------------

export function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
