/**
 * OTS enums, labels and pure helpers shared by server and client code.
 * No server-only imports.
 */

export const TEST_TYPES = [
  { value: "practice", label: "Practice Test" },
  { value: "assessment", label: "Assessment" },
  { value: "examination", label: "Examination" },
  { value: "mock", label: "Mock Test" },
  { value: "screening", label: "Screening Test" },
  { value: "certification", label: "Certification Test" },
  { value: "training", label: "Training Test" },
  { value: "interview", label: "Interview Test" },
  { value: "custom", label: "Custom Test" },
] as const;
export type TestType = (typeof TEST_TYPES)[number]["value"];

export const DIFFICULTIES = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
  { value: "mixed", label: "Mixed" },
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number]["value"];
/** Difficulties a single question can have ("mixed" only makes sense for a whole test). */
export const QUESTION_DIFFICULTIES = DIFFICULTIES.filter((d) => d.value !== "mixed");

/** Stored test status. "active" and "closed" are also DERIVED from the availability window — see `effectiveTestStatus`. */
export const TEST_STATUSES = [
  { value: "draft", label: "Draft", tone: "slate" },
  { value: "published", label: "Published", tone: "blue" },
  { value: "active", label: "Active", tone: "green" },
  { value: "closed", label: "Completed / Closed", tone: "amber" },
  { value: "archived", label: "Archived", tone: "rose" },
] as const;
export type TestStatus = "draft" | "published" | "closed" | "archived";
export type EffectiveTestStatus = (typeof TEST_STATUSES)[number]["value"];

export const QUESTION_STATUSES = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number]["value"];

export const ASSIGNMENT_STATUSES = [
  { value: "assigned", label: "Assigned", tone: "slate" },
  { value: "in_progress", label: "In Progress", tone: "blue" },
  { value: "submitted", label: "Submitted · Awaiting Evaluation", tone: "amber" },
  { value: "evaluated", label: "Evaluated · Result Pending", tone: "violet" },
  { value: "completed", label: "Completed", tone: "green" },
  { value: "expired", label: "Expired", tone: "rose" },
  { value: "cancelled", label: "Cancelled", tone: "rose" },
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]["value"];
export const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["assigned", "in_progress"];
/** An assignment in one of these blocks a duplicate assignment of the same test to the same person. */
export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["assigned", "in_progress", "submitted", "evaluated"];

export const ATTEMPT_STATUSES = [
  { value: "in_progress", label: "In Progress" },
  { value: "pending_evaluation", label: "Pending Manual Evaluation" },
  { value: "evaluated", label: "Evaluated" },
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]["value"];

export const SUBMIT_REASONS = {
  MANUAL: "Submitted by candidate",
  TIMEOUT_AUTO_SUBMISSION: "Auto-submitted: time ran out",
  DEADLINE_AUTO_SUBMISSION: "Auto-submitted: availability window closed",
  SECURITY_AUTO_SUBMISSION: "Auto-submitted: too many security violations",
} as const;
export type SubmitReason = keyof typeof SUBMIT_REASONS;

export const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;
export type Priority = (typeof PRIORITIES)[number]["value"];

export const RESULT_RELEASES = [
  { value: "immediate", label: "Show immediately", hint: "As soon as the attempt is fully evaluated (instantly for objective-only tests)." },
  { value: "after_evaluation", label: "Show after manual evaluation", hint: "Only once every subjective answer has been marked." },
  { value: "after_close", label: "Show after the test closes", hint: "When the test's end date passes or it is closed." },
  { value: "manual", label: "When a manager publishes it", hint: "Results stay hidden until someone with Publish Results releases them." },
  { value: "never", label: "Admin / manager only", hint: "Candidates never see results — only staff with report access do." },
] as const;
export type ResultRelease = (typeof RESULT_RELEASES)[number]["value"];

export const RESULT_DETAILS = [
  { value: "score", label: "Score only", hint: "Score, percentage and pass/fail. No answers." },
  { value: "responses", label: "Score + their answers", hint: "Also each question with their own answer and marks — not the correct answer." },
  { value: "correct", label: "Score + answers + correct answers", hint: "Also the correct answer for every question." },
] as const;
export type ResultDetail = (typeof RESULT_DETAILS)[number]["value"];

export const ATTEMPT_SCORING = [
  { value: "latest", label: "Latest attempt" },
  { value: "highest", label: "Highest score" },
  { value: "average", label: "Average score" },
] as const;
export type AttemptScoring = (typeof ATTEMPT_SCORING)[number]["value"];

export const CANDIDATE_KINDS = [
  { value: "employee", label: "Employee", source: "TalentOS" },
  { value: "user", label: "Staff User", source: "Admin Users" },
  { value: "applicant", label: "Applicant", source: "Careers" },
  { value: "student", label: "Student", source: "Cohort AI" },
] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number]["value"];

export interface CandidateRef {
  kind: CandidateKind;
  id: string;
}

export function candidateKey(ref: CandidateRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function parseCandidateKey(key: string): CandidateRef | null {
  const i = key.indexOf(":");
  if (i < 1) return null;
  const kind = key.slice(0, i);
  const id = key.slice(i + 1);
  if (!CANDIDATE_KINDS.some((k) => k.value === kind) || !id) return null;
  return { kind: kind as CandidateKind, id };
}

/** Everything a test can be assigned to. Each resolves to people LIVE from the owning module. */
export const TARGET_TYPES = [
  { value: "department", label: "Department", group: "Employees", source: "TalentOS departments" },
  { value: "designation", label: "Role / Designation", group: "Employees", source: "TalentOS designations" },
  { value: "team", label: "Team / User Group", group: "Employees", source: "TalentOS teams" },
  { value: "employment_type", label: "Employee Type", group: "Employees", source: "TalentOS employment types" },
  { value: "employee", label: "Individual Employee", group: "Employees", source: "TalentOS employees" },
  { value: "platform_role", label: "Platform Role", group: "Staff Users", source: "Admin user roles" },
  { value: "user", label: "Individual Staff User", group: "Staff Users", source: "Admin users" },
  { value: "applicant", label: "Individual Applicant", group: "Applicants", source: "Careers applications" },
  { value: "applicant_position", label: "Applicants by Position", group: "Applicants", source: "Careers job positions" },
  { value: "student", label: "Individual Student", group: "Students", source: "Cohort AI students" },
  { value: "batch", label: "Batch", group: "Students", source: "Cohort AI batches" },
  { value: "program", label: "Course / Program", group: "Students", source: "Cohort AI programs" },
] as const;
export type TargetType = (typeof TARGET_TYPES)[number]["value"];

export function labelOf<T extends readonly { value: string; label: string }[]>(list: T, value: string | null | undefined): string {
  return list.find((x) => x.value === value)?.label ?? (value ? value.replace(/_/g, " ") : "—");
}

export const TONE_CLASS: Record<string, string> = {
  slate: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  blue: "bg-primary/10 text-primary",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

export function toneFor(list: readonly { value: string; tone?: string }[], value: string): string {
  return TONE_CLASS[list.find((x) => x.value === value)?.tone ?? "slate"];
}

export const SECURITY_EVENT_TYPES = {
  tab_hidden: "Tab / window hidden",
  window_blur: "Window lost focus",
  fullscreen_exit: "Left full screen",
  copy_attempt: "Copy attempt",
  paste_attempt: "Paste attempt",
  cut_attempt: "Cut attempt",
  context_menu: "Right-click attempt",
  multiple_session: "Opened in another window / device",
  session_takeover: "Took over from another window",
  ip_changed: "IP address changed",
  late_save_rejected: "Answer after time was up",
} as const;
export type SecurityEventType = keyof typeof SECURITY_EVENT_TYPES;
/** Events that count towards `maxViolations` auto-submission. */
export const VIOLATION_EVENTS: SecurityEventType[] = ["tab_hidden", "fullscreen_exit", "multiple_session"];

export function fmtDuration(totalSec: number | null | undefined): string {
  if (totalSec === null || totalSec === undefined || !Number.isFinite(totalSec)) return "—";
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : `${Math.round(n * 10) / 10}%`;
}

export function fmtMarks(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return String(Math.round(n * 100) / 100);
}
