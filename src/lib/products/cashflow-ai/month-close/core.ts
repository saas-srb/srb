/**
 * Month-end close — pure core (no DB, no "server-only") so the page, the
 * actions and the tests share one definition.
 *
 * Source: local/CA_Pvt_Ltd_Complete_Checklist_README.md section 5. The step
 * KEYS are stored with the company's records, so the catalog is APPEND-ONLY:
 * never rename, reorder or delete a key, only add at the end.
 *
 * Months are explicit "YYYY-MM" strings and days are "YYYY-MM-DD" strings;
 * nothing here turns them into a local-timezone Date. "Today" is the India
 * date (IST, UTC+5:30, no daylight saving).
 */

export type StepKind = "data" | "person" | "lock";

export interface StepDef {
  key: string;
  kind: StepKind;
  title: string;
  /** Plain-English help: what this step is and how it gets done. */
  help: string;
  /** Where the fix is made. `{month}` is replaced by the chosen month. */
  href?: string;
  hrefLabel?: string;
}

export const STEPS: StepDef[] = [
  { key: "bank_reconciled", kind: "data", title: "Bank statement lines are matched", help: "Every line of this month's bank statements has been matched to an entry in your books.", href: "/cashflow-ai/bank-reconciliation", hrefLabel: "Open bank reconciliation" },
  { key: "settlements_booked", kind: "data", title: "Razorpay settlements are booked", help: "Razorpay pays out a day or two later, so a settlement paid out this month must be booked, or the bank and the books will disagree.", href: "/cashflow-ai/settlements", hrefLabel: "Open Razorpay settlements" },
  { key: "cash_counted", kind: "data", title: "Cash in hand is counted", help: "Each active cash account has a physical count recorded during the month.", href: "/cashflow-ai/cash-reconciliation", hrefLabel: "Record a cash count" },
  { key: "payroll_done", kind: "data", title: "Payroll is approved and government dues are paid", help: "The month's salary run is approved, and PF, ESI, TDS and other payroll dues are all marked paid.", href: "/cashflow-ai/payroll-runs", hrefLabel: "Open payroll" },
  { key: "bills_documented", kind: "data", title: "Vendor bills of the month have their documents", help: "Every vendor bill dated in this month is entered and has the bill file attached.", href: "/cashflow-ai/compliance/cleanup", hrefLabel: "Open the clean-up list" },
  { key: "receipts_proved", kind: "data", title: "Customer receipts have proof", help: "Every receipt recorded by hand this month (cash, cheque, transfer) has its proof attached.", href: "/cashflow-ai/compliance/cleanup", hrefLabel: "Open the clean-up list" },
  { key: "entries_classified", kind: "data", title: "No entry is without an account", help: "Every income or expense of the month is filed under an account in your chart of accounts.", href: "/cashflow-ai/compliance/cleanup", hrefLabel: "Open the clean-up list" },
  { key: "ageing_reviewed", kind: "person", title: "Receivable and payable ageing reviewed", help: "Someone has looked at who owes you and whom you owe, and chased or planned for the overdue ones.", href: "/cashflow-ai/receivables", hrefLabel: "Open receivables" },
  { key: "accruals_reviewed", kind: "person", title: "Accruals, prepaid items and provisions reviewed", help: "Expenses incurred but not yet billed, bills paid in advance, and amounts to set aside. Unless Accrual books are switched on, your ledger is on a cash basis: money counts only when it moves, so these are not posted automatically and a person decides (with the CA) whether any adjustment is needed and records it here. With Accrual books on, invoices and bills post by themselves, but prepaid items and provisions are still a person's call. You can switch Accrual books on in settings.", href: "/cashflow-ai/settings/accrual", hrefLabel: "Accrual books settings" },
  { key: "depreciation_done", kind: "person", title: "Depreciation posted, or confirmed not needed", help: "Confirm that the month's depreciation on fixed assets is posted, or that there is none to post this month.", href: "/cashflow-ai/assets", hrefLabel: "Open assets" },
  { key: "gst_tds_reconciled", kind: "person", title: "GST and TDS ledgers reconciled", help: "Match the GST and TDS in your books with the returns, challans and certificates. The GST and TDS modules are not built yet, so this is checked by a person (usually your CA) and recorded here.", href: "/cashflow-ai/compliance/checklist", hrefLabel: "Open the compliance checklist" },
  { key: "accrual_in_ledger", kind: "data", title: "Invoices and bills are in the ledger", help: "When Accrual books are switched on, every invoice and bill must be posted to the ledger and the receivable and payable accounts must agree with the invoice and bill records. This checks the whole ledger up to now, not only this month. If Accrual books are off, this step has nothing to check.", href: "/cashflow-ai/settings/accrual", hrefLabel: "Open Accrual books" },
  { key: "trial_balance", kind: "data", title: "Trial balance balances", help: "Total debits equal total credits at the end of the month.", href: "/cashflow-ai/trial-balance", hrefLabel: "Open trial balance" },
  { key: "pnl_bs_cf_reviewed", kind: "person", title: "Profit and loss, balance sheet and cash flow reviewed", help: "Someone has read all three for the month and they make sense.", href: "/cashflow-ai/reports/profit-and-loss", hrefLabel: "Open profit and loss" },
  { key: "unusual_reviewed", kind: "person", title: "Unusual entries reviewed", help: "Large or odd expenses, manual journal entries and negative balances have been looked at and explained.", href: "/cashflow-ai/general-ledger", hrefLabel: "Open the general ledger" },
  { key: "reports_shared", kind: "person", title: "Reports shared with management", help: "The month's reports have been sent to the people who need them.", href: "/cashflow-ai/reports/financial-summary", hrefLabel: "Open financial summary" },
  { key: "lock", kind: "lock", title: "Lock the month", help: "Closing the month posts a closing entry and stops anyone adding or changing entries dated in it. It needs a fiscal period defined for exactly this month.", href: "/cashflow-ai/settings/fiscal-periods", hrefLabel: "Fiscal periods" },
];

export const STEP_KEYS = STEPS.map((s) => s.key);
export const stepDef = (key: string): StepDef | undefined => STEPS.find((s) => s.key === key);
export const isPersonStepKey = (key: unknown): key is string => typeof key === "string" && STEPS.some((s) => s.key === key && s.kind === "person");

/** Links for the report-review step, which spans three pages. */
export const REPORT_LINKS = [
  { label: "Profit and loss", href: "/cashflow-ai/reports/profit-and-loss" },
  { label: "Balance sheet", href: "/cashflow-ai/reports/balance-sheet" },
  { label: "Cash flow", href: "/cashflow-ai/reports/cash-flow" },
];

// ---------------------------------------------------------------------------
// Dates (string based)
// ---------------------------------------------------------------------------

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function isMonthString(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = MONTH_RE.exec(v);
  return !!m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12; UTC so no timezone shift

export function monthBounds(month: string): { from: string; to: string; days: number } {
  if (!isMonthString(month)) throw new Error(`Not a month: ${month}`);
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = daysIn(y, m);
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, "0")}`, days };
}

export function shiftMonth(month: string, delta: number): string {
  if (!isMonthString(month)) throw new Error(`Not a month: ${month}`);
  const idx = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  const y = Math.floor(idx / 12);
  return `${y}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Today's India date, "YYYY-MM-DD". India has no daylight saving, so a fixed +5:30 shift is exact. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function currentMonthIst(now: Date = new Date()): string {
  return todayIst(now).slice(0, 7);
}

/** The month before today's India month: where the close page opens. */
export function defaultCloseMonth(now: Date = new Date()): string {
  return shiftMonth(currentMonthIst(now), -1);
}

/** A month can only be closed once its last day is behind us. `today` is a "YYYY-MM-DD". */
export function monthHasEnded(month: string, today: string): boolean {
  return DAY_RE.test(today) && today > monthBounds(month).to;
}

export const dateInMonth = (day: string | null | undefined, month: string): boolean => typeof day === "string" && day.slice(0, 7) === month;

/** India's financial year runs 1 April to 31 March. "2026-03" is FY 2025-26, month 12; "2026-04" is FY 2026-27, month 1. */
export function indiaFiscalYear(month: string): { label: string; startYear: number; monthNumber: number } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const startYear = m >= 4 ? y : y - 1;
  return { label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`, startYear, monthNumber: ((m + 8) % 12) + 1 };
}

// ---------------------------------------------------------------------------
// Facts and evaluation
// ---------------------------------------------------------------------------

/**
 * What the books show for the month. A field is `undefined` when it could not
 * be read — that must never be treated as "fine".
 */
export interface MonthCloseFacts {
  unmatchedBankLines?: number;
  settlementsOpen?: number;
  /** Active cash accounts with no count recorded in the month. */
  cashAccountsNotCounted?: number;
  payrollApproved?: boolean;
  /** Payroll dues of the month not yet marked paid (only meaningful when payroll is approved). */
  statutoryDuesUnpaid?: number;
  billsWithoutDocument?: number;
  receiptsWithoutProof?: number;
  entriesWithoutAccount?: number;
  /** Accrual books off, or on with how many documents are not in the ledger and the receivable/payable gap (absolute, both zero = agrees). */
  accrual?: { on: false } | { on: true; missing: number; difference: number };
  trialBalance?: { balanced: boolean; totalDebits: number; totalCredits: number };
}

export interface StepRecord {
  stepKey: string;
  note: string | null;
  recordedBy: string;
  recordedByEmail: string | null;
  recordedAt: string;
}

export type StepStatus = "passed" | "failing" | "unknown" | "recorded" | "todo";

export interface StepView extends StepDef {
  status: StepStatus;
  /** One plain sentence about what was found. */
  detail: string;
  record: StepRecord | null;
}

const n = (count: number, one: string, many: string = `${one}s`) => `${count} ${count === 1 ? one : many}`;

type Check = { status: "passed" | "failing" | "unknown"; detail: string };

function countCheck(count: number | undefined, okText: string, badText: (c: number) => string): Check {
  if (count === undefined || !Number.isFinite(count)) return { status: "unknown", detail: "Could not be checked just now. Try again; do not treat it as done." };
  return count === 0 ? { status: "passed", detail: okText } : { status: "failing", detail: badText(count) };
}

export function checkDataStep(key: string, f: MonthCloseFacts): Check {
  switch (key) {
    case "bank_reconciled":
      return countCheck(f.unmatchedBankLines, "No bank statement line of this month is waiting to be matched.", (c) => `${n(c, "bank statement line")} of this month not matched yet.`);
    case "settlements_booked":
      return countCheck(f.settlementsOpen, "No Razorpay settlement of this month is waiting to be booked.", (c) => `${n(c, "Razorpay settlement")} paid out this month not booked yet.`);
    case "cash_counted":
      return countCheck(f.cashAccountsNotCounted, "Every active cash account has a count this month (or you keep none).", (c) => `${n(c, "cash account")} with no count recorded this month.`);
    case "payroll_done": {
      if (f.payrollApproved === undefined) return { status: "unknown", detail: "Could not be checked just now. Try again; do not treat it as done." };
      if (!f.payrollApproved) return { status: "failing", detail: "No approved payroll run for this month. If you have no employees to pay, record an override reason when locking." };
      return countCheck(f.statutoryDuesUnpaid, "Payroll is approved and all its government dues are paid.", (c) => `Payroll is approved, but ${n(c, "government due")} not marked paid.`);
    }
    case "bills_documented":
      return countCheck(f.billsWithoutDocument, "Every vendor bill of this month has its document.", (c) => `${n(c, "vendor bill")} of this month without a document.`);
    case "receipts_proved":
      return countCheck(f.receiptsWithoutProof, "Every receipt of this month has proof.", (c) => `${n(c, "receipt")} of this month without proof.`);
    case "entries_classified":
      return countCheck(f.entriesWithoutAccount, "Every income and expense of this month has an account.", (c) => `${n(c, "entry", "entries")} of this month without an account.`);
    case "accrual_in_ledger": {
      const a = f.accrual;
      if (!a || (a.on && (!Number.isFinite(a.missing) || !Number.isFinite(a.difference)))) return { status: "unknown", detail: "Could not be checked just now. Try again; do not treat it as done." };
      if (!a.on) return { status: "passed", detail: "Accrual books are off, so the ledger is on a cash basis and there is nothing to tie out." };
      if (a.missing > 0) return { status: "failing", detail: `${n(a.missing, "invoice or bill")} not posted to the ledger yet.` };
      if (a.difference !== 0) return { status: "failing", detail: `Receivable and payable in the ledger differ from the invoice and bill records by ${a.difference}.` };
      return { status: "passed", detail: "Every invoice and bill is posted and the ledger agrees with the records." };
    }
    case "trial_balance": {
      const tb = f.trialBalance;
      if (!tb) return { status: "unknown", detail: "Could not be checked just now. Try again; do not treat it as done." };
      return tb.balanced ? { status: "passed", detail: "Debits and credits agree at the end of the month." } : { status: "failing", detail: `Debits ${tb.totalDebits} and credits ${tb.totalCredits} do not agree at the end of the month.` };
    }
    default:
      return { status: "unknown", detail: "Not checked." };
  }
}

/** Every step in order, with its status. The lock step is added by `decideLock`'s caller (its state depends on the fiscal period). */
export function evaluateSteps(facts: MonthCloseFacts, records: StepRecord[]): StepView[] {
  const byKey = new Map(records.map((r) => [r.stepKey, r]));
  return STEPS.filter((s) => s.kind !== "lock").map((s) => {
    if (s.kind === "data") return { ...s, ...checkDataStep(s.key, facts), record: null };
    const record = byKey.get(s.key) ?? null;
    return { ...s, status: record ? ("recorded" as const) : ("todo" as const), detail: record ? "" : "Not recorded yet.", record };
  });
}

/** Steps the books prove that are not passing (failing, or unreadable: unreadable never counts as passed). */
export const blockingSteps = (steps: StepView[]): StepView[] => steps.filter((s) => s.kind === "data" && s.status !== "passed");

export interface OverrideRecord {
  reason: string;
  /** The failing step keys the person was shown when they overrode. */
  coveredKeys: string[];
  recordedBy: string;
  recordedByEmail: string | null;
  recordedAt: string;
}

/** An override only covers what the person saw: a step that started failing later still blocks. */
export function overrideCovers(blockingKeys: string[], override: OverrideRecord | null): boolean {
  if (!override) return false;
  return blockingKeys.every((k) => override.coveredKeys.includes(k));
}

export const MIN_REASON_LENGTH = 10;
export const MAX_NOTE_LENGTH = 500;

export function validateNote(v: unknown, opts: { required?: boolean } = {}): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return opts.required ? { ok: false, error: "Please write a note." } : { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: "The note must be text." };
  const t = v.trim();
  if (!t) return opts.required ? { ok: false, error: "Please write a note." } : { ok: true, value: null };
  if (t.length > MAX_NOTE_LENGTH) return { ok: false, error: `Keep the note under ${MAX_NOTE_LENGTH} characters.` };
  return { ok: true, value: t };
}

export function validateOverrideReason(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const r = validateNote(v, { required: true });
  if (!r.ok) return { ok: false, error: "Please give the reason for locking anyway." };
  if (r.value!.length < MIN_REASON_LENGTH) return { ok: false, error: `Give a proper reason (at least ${MIN_REASON_LENGTH} characters) so the next person understands.` };
  return { ok: true, value: r.value! };
}

export type PeriodState = { state: "none" } | { state: "open" | "closed"; id: string; name: string } | { state: "mismatch"; name: string };

export interface LockDecision {
  allowed: boolean;
  /** True when the only thing in the way is failing steps, which a permitted person can override. */
  needsOverride: boolean;
  overridden: boolean;
  reason: string | null;
}

export function decideLock(input: { month: string; today: string; period: PeriodState; blocking: StepView[]; override: OverrideRecord | null }): LockDecision {
  const no = (reason: string, needsOverride = false): LockDecision => ({ allowed: false, needsOverride, overridden: false, reason });
  if (!monthHasEnded(input.month, input.today)) return no(`${monthLabel(input.month)} has not ended yet. A month can only be locked after its last day.`);
  const p = input.period;
  if (p.state === "none") return no("There is no fiscal period for this month. Define one on the Fiscal Periods settings page (start on the 1st, end on the last day of the month), then come back.");
  if (p.state === "mismatch") return no(`The fiscal period "${p.name}" does not match this month exactly. Define a period that starts on the 1st and ends on the last day of ${monthLabel(input.month)} on the Fiscal Periods settings page.`);
  if (p.state === "closed") return no("This month is already locked.");
  const keys = input.blocking.map((s) => s.key);
  if (keys.length === 0) return { allowed: true, needsOverride: false, overridden: false, reason: null };
  if (overrideCovers(keys, input.override)) return { allowed: true, needsOverride: false, overridden: true, reason: null };
  return no(`${n(keys.length, "check")} did not pass. Fix them, or record a reason to lock anyway.`, true);
}

export function progressOf(steps: StepView[]): { done: number; total: number; percent: number } {
  const total = steps.length;
  const done = steps.filter((s) => s.status === "passed" || s.status === "recorded").length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
