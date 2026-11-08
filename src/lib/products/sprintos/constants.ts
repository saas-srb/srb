/**
 * Client-safe PMS constants and pure helpers. NEVER import `server-only` here —
 * this module is imported by client components (badges, forms, tables). Server
 * modules re-export from here where convenient.
 *
 * Badge/dot class shapes mirror `src/lib/talentos/employee-status.ts` so the shared
 * badge styling applies unchanged.
 */

// ---------------------------------------------------------------------------
// Project status
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES = [
  { value: "planning", label: "Planning", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50", open: true },
  { value: "in_progress", label: "In Progress", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70", open: true },
  { value: "review", label: "Review", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", open: true },
  { value: "testing", label: "Testing", badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400", dotClass: "bg-purple-500", open: true },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", open: false },
  { value: "on_hold", label: "On Hold", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", open: true },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", open: false },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

export const DEFAULT_PROJECT_STATUS: ProjectStatus = "planning";

/** Statuses that count as "active" work in flight. */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = ["planning", "in_progress", "review", "testing"];

export function isValidProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && PROJECT_STATUSES.some((s) => s.value === value);
}

export function getProjectStatusMeta(status: string | undefined) {
  return PROJECT_STATUSES.find((s) => s.value === status) ?? PROJECT_STATUSES[0];
}

/**
 * Allowed status transitions. `completed` and `cancelled` are terminal except
 * they can be reopened to `in_progress` / `on_hold` if needed.
 */
export const PROJECT_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planning: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["review", "testing", "on_hold", "completed", "cancelled"],
  review: ["in_progress", "testing", "on_hold", "completed", "cancelled"],
  testing: ["in_progress", "review", "on_hold", "completed", "cancelled"],
  on_hold: ["planning", "in_progress", "cancelled"],
  completed: ["in_progress"],
  cancelled: ["planning", "in_progress"],
};

export function canTransitionProject(from: string, to: string): boolean {
  if (!isValidProjectStatus(from) || !isValidProjectStatus(to)) return false;
  if (from === to) return true;
  return PROJECT_STATUS_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Task status (Kanban columns, in board order)
// ---------------------------------------------------------------------------

export const TASK_STATUSES = [
  { value: "todo", label: "To Do", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", done: false },
  { value: "in_progress", label: "In Progress", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70", done: false },
  { value: "review", label: "Review", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", done: false },
  { value: "testing", label: "Testing", badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400", dotClass: "bg-purple-500", done: false },
  { value: "done", label: "Done", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", done: true },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];

export const DEFAULT_TASK_STATUS: TaskStatus = "todo";

/** Board column order. */
export const TASK_STATUS_ORDER: TaskStatus[] = TASK_STATUSES.map((s) => s.value);

export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUSES.some((s) => s.value === value);
}

export function getTaskStatusMeta(status: string | undefined) {
  return TASK_STATUSES.find((s) => s.value === status) ?? TASK_STATUSES[0];
}

export function isTaskDone(status: string | undefined): boolean {
  return getTaskStatusMeta(status).done;
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export const PRIORITIES = [
  { value: "low", label: "Low", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", weight: 1 },
  { value: "medium", label: "Medium", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", weight: 2 },
  { value: "high", label: "High", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", weight: 3 },
  { value: "critical", label: "Critical", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", weight: 4 },
] as const;

export type Priority = (typeof PRIORITIES)[number]["value"];

export const DEFAULT_PRIORITY: Priority = "medium";

export function isValidPriority(value: unknown): value is Priority {
  return typeof value === "string" && PRIORITIES.some((p) => p.value === value);
}

export function getPriorityMeta(value: string | undefined) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[1];
}

// ---------------------------------------------------------------------------
// Timesheet entry status
// ---------------------------------------------------------------------------

export const TIMESHEET_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
  { value: "submitted", label: "Submitted", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "approved", label: "Approved", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "rejected", label: "Rejected", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
] as const;

export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number]["value"];

export const DEFAULT_TIMESHEET_STATUS: TimesheetStatus = "draft";

/** Statuses whose hours count toward project actual cost / costing. */
export const COSTED_TIMESHEET_STATUSES: TimesheetStatus[] = ["submitted", "approved"];

/** Statuses the employee can still edit / delete themselves. */
export const EDITABLE_TIMESHEET_STATUSES: TimesheetStatus[] = ["draft", "rejected"];

export function isValidTimesheetStatus(value: unknown): value is TimesheetStatus {
  return typeof value === "string" && TIMESHEET_STATUSES.some((s) => s.value === value);
}

export function getTimesheetStatusMeta(status: string | undefined) {
  return TIMESHEET_STATUSES.find((s) => s.value === status) ?? TIMESHEET_STATUSES[0];
}

export const MAX_TIMESHEET_HOURS_PER_DAY = 16;

/** "HH:mm" → minutes since midnight, or null. */
export function parseHHmm(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// Milestone status
// ---------------------------------------------------------------------------

export const MILESTONE_STATUSES = [
  { value: "pending", label: "Pending", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
  { value: "in_progress", label: "In Progress", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70" },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]["value"];

export const DEFAULT_MILESTONE_STATUS: MilestoneStatus = "pending";

export function isValidMilestoneStatus(value: unknown): value is MilestoneStatus {
  return typeof value === "string" && MILESTONE_STATUSES.some((s) => s.value === value);
}

export function getMilestoneStatusMeta(status: string | undefined) {
  return MILESTONE_STATUSES.find((s) => s.value === status) ?? MILESTONE_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Client status
// ---------------------------------------------------------------------------

export const CLIENT_STATUSES = [
  { value: "prospect", label: "Prospect", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50", active: false },
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", active: true },
  { value: "inactive", label: "Inactive", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", active: false },
  { value: "archived", label: "Archived", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60", active: false },
] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number]["value"];

export const DEFAULT_CLIENT_STATUS: ClientStatus = "prospect";

export function isValidClientStatus(value: unknown): value is ClientStatus {
  return typeof value === "string" && CLIENT_STATUSES.some((s) => s.value === value);
}

export function getClientStatusMeta(status: string | undefined) {
  return CLIENT_STATUSES.find((s) => s.value === status) ?? CLIENT_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Project member roles
// ---------------------------------------------------------------------------

export const PROJECT_MEMBER_ROLES = [
  { value: "manager", label: "Project Manager" },
  { value: "lead", label: "Tech Lead" },
  { value: "developer", label: "Developer" },
  { value: "designer", label: "Designer" },
  { value: "qa", label: "QA Engineer" },
  { value: "analyst", label: "Business Analyst" },
  { value: "devops", label: "DevOps" },
] as const;

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number]["value"];

export const DEFAULT_MEMBER_ROLE: ProjectMemberRole = "developer";

export function isValidMemberRole(value: unknown): value is ProjectMemberRole {
  return typeof value === "string" && PROJECT_MEMBER_ROLES.some((r) => r.value === value);
}

export function getMemberRoleLabel(value: string | undefined): string {
  return PROJECT_MEMBER_ROLES.find((r) => r.value === value)?.label ?? "Member";
}

// ---------------------------------------------------------------------------
// Project categories (defaults — overridable in PMS settings)
// ---------------------------------------------------------------------------

export const DEFAULT_PROJECT_CATEGORIES = [
  "Web Development",
  "Mobile App",
  "AI / ML",
  "Data Engineering",
  "Cloud & DevOps",
  "UI / UX Design",
  "Maintenance & Support",
  "Consulting",
] as const;

export const DEFAULT_CURRENCY = "INR";

export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"] as const;

// ---------------------------------------------------------------------------
// Project health — derived from dates + progress + status
// ---------------------------------------------------------------------------

export type ProjectHealth = "on_track" | "at_risk" | "overdue" | "completed" | "on_hold";

export const PROJECT_HEALTH_META: Record<ProjectHealth, { label: string; badgeClass: string; dotClass: string }> = {
  on_track: { label: "On Track", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  at_risk: { label: "At Risk", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  overdue: { label: "Overdue", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  completed: { label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  on_hold: { label: "On Hold", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60" },
};

/**
 * Pure health calculation. `now` is injectable for deterministic tests / seeds.
 * - completed / cancelled → completed / on_hold
 * - past end date and not done → overdue
 * - < 20% of schedule time remaining but > 20% work remaining → at_risk
 * - otherwise on_track
 */
export function computeProjectHealth(
  project: { status: string; startDate: string | null; endDate: string | null; progressPercent: number },
  now: Date = new Date()
): ProjectHealth {
  if (project.status === "completed") return "completed";
  if (project.status === "cancelled") return "on_hold";
  if (project.status === "on_hold") return "on_hold";

  const today = now.getTime();
  const end = project.endDate ? new Date(`${project.endDate}T23:59:59`).getTime() : null;
  const start = project.startDate ? new Date(`${project.startDate}T00:00:00`).getTime() : null;

  if (end !== null && today > end) return "overdue";

  if (start !== null && end !== null && end > start) {
    const scheduleElapsed = (today - start) / (end - start); // 0..1
    const workDone = project.progressPercent / 100; // 0..1
    if (scheduleElapsed - workDone > 0.2) return "at_risk";
  }
  return "on_track";
}

// ---------------------------------------------------------------------------
// Generic label helper
// ---------------------------------------------------------------------------

export function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
