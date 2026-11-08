/**
 * The status of a person's account. Pure and client-safe: the same rules run in the Users screen, on the server when a status is changed and
 * in the tests. The Director (the company's top role) sets it; it decides whether the person can sign in at all.
 *
 *   Working:  Active, On probation, On leave, Serving notice  → can sign in
 *   Blocked:  Suspended, Deactivated                           → cannot sign in; reversible, nothing is lost
 *   Left:     Resigned, Terminated, Retired, Contract ended    → cannot sign in; the person has left the company
 *
 * Changing to a status that cannot sign in ends every sign-in of that person at once, in every product. Their roles, records and HR file stay.
 */

export const ACCOUNT_STATUSES = [
  { value: "active", label: "Active", group: "working", canSignIn: true, tone: "green", description: "Works and signs in normally." },
  { value: "probation", label: "On probation", group: "working", canSignIn: true, tone: "blue", description: "New joiner on probation. Signs in normally." },
  { value: "on_leave", label: "On leave", group: "working", canSignIn: true, tone: "blue", description: "Away on approved leave. Can still sign in." },
  { value: "notice_period", label: "Serving notice", group: "working", canSignIn: true, tone: "amber", needsLastDay: true, description: "Has given notice and is working until the last working day." },
  { value: "suspended", label: "Suspended", group: "blocked", canSignIn: false, tone: "red", needsReason: true, description: "Blocked for now, for example during an enquiry. Can be reversed." },
  { value: "deactivated", label: "Deactivated", group: "blocked", canSignIn: false, tone: "muted", description: "Account switched off. Can be turned on again." },
  { value: "resigned", label: "Resigned (left company)", group: "left", canSignIn: false, tone: "muted", needsLastDay: true, description: "Has left the company by resignation." },
  { value: "terminated", label: "Terminated (left company)", group: "left", canSignIn: false, tone: "red", needsReason: true, needsLastDay: true, description: "Has been let go by the company." },
  { value: "retired", label: "Retired (left company)", group: "left", canSignIn: false, tone: "muted", needsLastDay: true, description: "Has retired from the company." },
  { value: "contract_ended", label: "Contract ended (left company)", group: "left", canSignIn: false, tone: "muted", needsLastDay: true, description: "Fixed-term or contract work has finished." },
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]["value"];
export type StatusTone = (typeof ACCOUNT_STATUSES)[number]["tone"];

export const ACCOUNT_STATUS_VALUES: readonly AccountStatus[] = ACCOUNT_STATUSES.map((s) => s.value);
export const BLOCKED_STATUSES: AccountStatus[] = ACCOUNT_STATUSES.filter((s) => !s.canSignIn).map((s) => s.value);
export const LEFT_STATUSES: AccountStatus[] = ACCOUNT_STATUSES.filter((s) => s.group === "left").map((s) => s.value);

export function isAccountStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && (ACCOUNT_STATUS_VALUES as readonly string[]).includes(v);
}

export const statusMeta = (s: AccountStatus) => ACCOUNT_STATUSES.find((x) => x.value === s)!;

/**
 * The status of a stored account. Accounts from before statuses existed have none: they were "deactivated" by emptying their roles, so
 * no roles = deactivated, anything else = active.
 */
export function statusOf(user: { status?: string | null; roles?: readonly string[] | null; platformRoleId?: string | null }): AccountStatus {
  if (isAccountStatus(user.status)) return user.status;
  // Platform staff hold a platform role instead of workspace roles.
  return (user.roles ?? []).length > 0 || !!user.platformRoleId ? "active" : "deactivated";
}

/** Whether an account with this stored data may sign in and use the products. */
export function canSignIn(user: { status?: string | null; roles?: readonly string[] | null; platformRoleId?: string | null }): boolean {
  return statusMeta(statusOf(user)).canSignIn;
}

/** What to tell someone who cannot sign in (shown only after their password was right). */
export function blockedMessage(status: AccountStatus): string {
  if (LEFT_STATUSES.includes(status)) return "This account belongs to someone who has left the company, so it can't sign in. Contact your Director if this is a mistake.";
  if (status === "suspended") return "This account is suspended, so it can't sign in right now. Contact your Director.";
  return "This account has been deactivated, so it can't sign in. Contact your Director.";
}

// ── The HR file follows the account ───────────────────────────────────────────

export type HrEmployeeStatus = "probation" | "active" | "on_leave" | "notice_period" | "relieved" | "terminated" | "suspended" | "deactivated";

export function toEmployeeStatus(s: AccountStatus): HrEmployeeStatus {
  switch (s) {
    case "resigned":
    case "retired":
    case "contract_ended":
      return "relieved";
    default:
      return s;
  }
}

/** The account status an HR status change implies (a relieved employee is recorded as resigned). */
export function fromEmployeeStatus(s: string): AccountStatus | null {
  if (s === "relieved") return "resigned";
  return isAccountStatus(s) ? s : null;
}

// ── Who may change what ───────────────────────────────────────────────────────

export interface StatusChangeInput {
  actor: { id: string; isDirector: boolean };
  target: { id: string; isDirector: boolean; status: AccountStatus };
  to: AccountStatus;
  reason: string;
  lastWorkingDay: string | null;
  /** How many other Directors can still sign in, not counting the target. */
  otherActiveDirectors: number;
  today: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The reason this change must not happen, or null. */
export function checkStatusChange(i: StatusChangeInput): string | null {
  if (!isAccountStatus(i.to)) return "Choose a valid status.";
  if (i.actor.id === i.target.id) return "You can't change your own status.";
  if (i.to === i.target.status) return `This account is already ${statusMeta(i.to).label.toLowerCase()}.`;
  if (i.target.isDirector && !i.actor.isDirector) return "Only a Director can change a Director's status.";
  const meta = statusMeta(i.to);
  if (!meta.canSignIn && i.target.isDirector && i.otherActiveDirectors < 1) return "A company needs at least one Director who can sign in. Make someone else a Director first.";
  const reason = i.reason.trim();
  if ("needsReason" in meta && meta.needsReason && reason.length < 3) return "Write a short reason. It is kept in the account's history.";
  if (reason.length > 500) return "Keep the reason under 500 characters.";
  if ("needsLastDay" in meta && meta.needsLastDay) {
    if (!i.lastWorkingDay || !ISO.test(i.lastWorkingDay) || Number.isNaN(Date.parse(i.lastWorkingDay))) return "Enter the last working day.";
  } else if (i.lastWorkingDay && !ISO.test(i.lastWorkingDay)) return "That date isn't valid.";
  return null;
}
