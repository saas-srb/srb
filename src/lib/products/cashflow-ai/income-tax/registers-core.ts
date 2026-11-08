/**
 * Losses register, return / audit status and tax notices: the pure part — no DB.
 *
 * Nothing about the law is built in. Time limits for carrying a loss forward, return due dates and audit thresholds are the CA's:
 * the company types in the last year a loss can be used, the date a notice must be answered by, and whether an audit applies.
 * This file only checks what was typed and words the status back in plain English.
 */
import { isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { realDate, type LossKind } from "@/lib/products/cashflow-ai/income-tax/core";

// ───────────────────────────── losses ─────────────────────────────

export interface LossInput {
  fy: string;
  kind: LossKind;
  amount: number;
  available: number;
  validUntilFy: string | null;
  note: string | null;
}

const LOSS_KINDS = ["business", "unabsorbed_depreciation", "other"];
const MAX_AMOUNT = 1e11;

export function lossProblem(l: Partial<LossInput>): string | null {
  if (!l.fy || !isFinancialYear(l.fy)) return "Choose the year the loss arose, like 2024-25.";
  if (!l.kind || !LOSS_KINDS.includes(l.kind)) return "Choose the kind of loss.";
  if (l.amount === undefined || !Number.isFinite(l.amount) || l.amount <= 0 || l.amount > MAX_AMOUNT) return "Enter the original amount of the loss (more than zero).";
  if (l.available === undefined || !Number.isFinite(l.available) || l.available < 0) return "Enter what is still available to set off (zero or more).";
  if (l.available > l.amount) return "What is still available cannot be more than the original loss.";
  if (l.validUntilFy) {
    if (!isFinancialYear(l.validUntilFy)) return "The last year it can be used must look like 2032-33.";
    if (l.validUntilFy < l.fy) return "The last year it can be used cannot be before the year the loss arose.";
  }
  if (l.note && l.note.length > 500) return "Keep the note under 500 characters.";
  return null;
}

// ───────────────────────────── return and audit status ─────────────────────────────

export type AuditApplicable = "yes" | "no" | "undecided";

export interface ReturnInput {
  formLabel: string | null;
  filedOn: string | null;
  acknowledgementNo: string | null;
  verifiedOn: string | null;
  auditApplicable: AuditApplicable;
  auditReportFiledOn: string | null;
  auditUdin: string | null;
  auditedBy: string | null;
  note: string | null;
}

const TEXT_CAPS: [keyof ReturnInput, number, string][] = [
  ["formLabel", 40, "Return form"],
  ["acknowledgementNo", 60, "Acknowledgement number"],
  ["auditUdin", 60, "UDIN or acknowledgement"],
  ["auditedBy", 120, "Audit done by"],
  ["note", 500, "Note"],
];

/** `today` is injected (YYYY-MM-DD, India date) so a "filed on" date cannot be in the future. */
export function returnProblem(r: ReturnInput, today: string): string | null {
  for (const [k, max, label] of TEXT_CAPS) {
    const v = r[k];
    if (typeof v === "string" && v.length > max) return `${label} is too long (most ${max} characters).`;
  }
  if (r.auditApplicable !== "yes" && r.auditApplicable !== "no" && r.auditApplicable !== "undecided") return "Choose whether a tax audit applies.";
  const dates: [string | null, string][] = [[r.filedOn, "return filed on"], [r.verifiedOn, "e-verified on"], [r.auditReportFiledOn, "audit report filed on"]];
  for (const [d, label] of dates) {
    if (!d) continue;
    if (!realDate(d)) return `Enter ${label} as a real date.`;
    if (d > today) return `The ${label} date cannot be in the future.`;
  }
  if (r.verifiedOn && !r.filedOn) return "Enter the date the return was filed before the date it was e-verified.";
  if (r.filedOn && r.verifiedOn && r.verifiedOn < r.filedOn) return "The return cannot be e-verified before it was filed.";
  return null;
}

/** One plain line for a year. Deliberately says nothing about due dates. */
export function returnStatusText(r: Pick<ReturnInput, "filedOn" | "verifiedOn"> | null): string {
  const dmy = (d: string) => d.split("-").reverse().join("-");
  if (!r || !r.filedOn) return "Return not filed yet";
  if (!r.verifiedOn) return `Filed on ${dmy(r.filedOn)}, not yet e-verified`;
  return "Filed and e-verified";
}

export function auditStatusText(r: Pick<ReturnInput, "auditApplicable" | "auditReportFiledOn"> | null): string {
  const a = r?.auditApplicable ?? "undecided";
  if (a === "undecided") return "Tax audit: not decided yet (ask your CA)";
  if (a === "no") return "Tax audit: not applicable";
  return r?.auditReportFiledOn ? `Tax audit: report filed on ${r.auditReportFiledOn.split("-").reverse().join("-")}` : "Tax audit: applicable, report not filed yet";
}

// ───────────────────────────── notices ─────────────────────────────

export type NoticeStatus = "open" | "replied" | "closed" | "appealed";
export const NOTICE_STATUS_LABEL: Record<NoticeStatus, string> = { open: "Open", replied: "Replied", closed: "Closed", appealed: "Appealed" };
export const NOTICE_STATUSES = Object.keys(NOTICE_STATUS_LABEL) as NoticeStatus[];

export interface NoticeInput {
  type: string;
  reference: string | null;
  fy: string | null;
  receivedOn: string;
  responseDueOn: string | null;
  status: NoticeStatus;
  amountDemanded: number | null;
  note: string | null;
}

export function noticeProblem(n: NoticeInput, today: string): string | null {
  if (!n.type || !n.type.trim()) return "Say what kind of notice this is, like Intimation, Demand or Scrutiny.";
  if (n.type.length > 80) return "The notice type is too long (most 80 characters).";
  if (n.reference && n.reference.length > 120) return "The section or reference is too long (most 120 characters).";
  if (n.fy && !isFinancialYear(n.fy)) return "Choose a financial year like 2026-27, or leave it blank.";
  if (!n.receivedOn || !realDate(n.receivedOn)) return "Enter the date you received the notice.";
  if (n.receivedOn > today) return "The received date cannot be in the future.";
  if (n.responseDueOn) {
    if (!realDate(n.responseDueOn)) return "Enter the reply-due date as a real date.";
    if (n.responseDueOn < n.receivedOn) return "The reply-due date cannot be before the date received.";
  }
  if (!NOTICE_STATUSES.includes(n.status)) return "Choose the status of the notice.";
  if (n.amountDemanded !== null && (!Number.isFinite(n.amountDemanded) || n.amountDemanded < 0 || n.amountDemanded > 1e11)) return "Enter the amount demanded as zero or more, or leave it blank.";
  if (n.note && n.note.length > 500) return "Keep the note under 500 characters.";
  return null;
}

export function noticeEventProblem(e: { date: string; text: string }, today: string): string | null {
  if (!realDate(e.date)) return "Enter the date of this update as a real date.";
  if (e.date > today) return "The date of an update cannot be in the future.";
  if (!e.text || !e.text.trim()) return "Write what happened (for example, reply sent on the portal).";
  if (e.text.length > 1000) return "Keep the update under 1000 characters.";
  return null;
}

const dayNumber = (d: string) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);

/** Days from today to the typed reply-due date: negative once it has passed. null while no date was typed. */
export function daysToReply(responseDueOn: string | null, today: string): number | null {
  return responseDueOn ? dayNumber(responseDueOn) - dayNumber(today) : null;
}

/** "Reply due in 5 days", "Reply due today", "Overdue by 3 days". Only an open notice is chased. */
export function replyDueText(n: { status: NoticeStatus; responseDueOn: string | null }, today: string): string | null {
  if (n.status !== "open") return null;
  const d = daysToReply(n.responseDueOn, today);
  if (d === null) return "No reply-due date entered";
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? "" : "s"}`;
  if (d === 0) return "Reply due today";
  return `Reply due in ${d} day${d === 1 ? "" : "s"}`;
}

/** Open notices first (soonest reply date first, undated last), then the rest newest first. */
export function sortNotices<T extends { status: NoticeStatus; responseDueOn: string | null; receivedOn: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ao = a.status === "open" ? 0 : 1, bo = b.status === "open" ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (ao === 0) return (a.responseDueOn ?? "9999-99-99").localeCompare(b.responseDueOn ?? "9999-99-99");
    return b.receivedOn.localeCompare(a.receivedOn);
  });
}
