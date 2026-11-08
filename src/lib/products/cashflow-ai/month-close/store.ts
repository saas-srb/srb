import { safeDay } from "@/lib/products/cashflow-ai/accrual/core";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { BANK_STATEMENT_LINES_COLLECTION } from "@/lib/products/cashflow-ai/bank-reconciliation";
import { SETTLEMENTS_COLLECTION } from "@/lib/products/cashflow-ai/payments/settlements";
import { CASH_COUNTS_COLLECTION } from "@/lib/products/cashflow-ai/cash-reconciliation";
import { listCashAccounts } from "@/lib/products/cashflow-ai/cash-accounts";
import { cleanupReport } from "@/lib/products/cashflow-ai/hygiene";
import { getTrialBalance } from "@/lib/products/cashflow-ai/reports/trial-balance";
import { closePeriod, listFiscalPeriods } from "@/lib/products/cashflow-ai/fiscal-periods";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { accrualTieOut, countMissingAccruals } from "@/lib/products/cashflow-ai/accrual/engine";
import { PAYROLL_RUNS_COLLECTION } from "@/lib/products/talentos/payroll-run";
import { duesForMonth } from "@/lib/products/talentos/statutory-dues";
import {
  blockingSteps,
  currentMonthIst,
  dateInMonth,
  decideLock,
  evaluateSteps,
  isMonthString,
  isPersonStepKey,
  monthBounds,
  monthLabel,
  todayIst,
  validateNote,
  validateOverrideReason,
  type LockDecision,
  type MonthCloseFacts,
  type OverrideRecord,
  type PeriodState,
  type StepRecord,
  type StepView,
} from "@/lib/products/cashflow-ai/month-close/core";

export const MONTH_CLOSE_COLLECTION = "fms_month_close_steps";
/** Step key under which a lock-anyway reason is stored (not a catalog step). */
const OVERRIDE_KEY = "__override";

interface StepDoc {
  _id: string;
  month: string;
  stepKey: string;
  note: string | null;
  /** Only on the override row: the failing steps the person was looking at. */
  coveredKeys?: string[];
  recordedBy: string;
  recordedByEmail: string | null;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

type Actor = { id: string; email: string | null };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Awaited, so the very first concurrent writers cannot slip past an index that is still being built.
let indexesEnsured: Promise<unknown> | null = null;
async function col() {
  const db = await getDb();
  const c = db.collection<StepDoc>(MONTH_CLOSE_COLLECTION);
  if (!indexesEnsured) indexesEnsured = c.createIndex({ month: 1, stepKey: 1 }, { unique: true }).catch(() => {});
  await indexesEnsured;
  return c;
}

/** The server's own calendar, same as how fiscal periods and statement dates are saved (`new Date("YYYY-MM-DDT00:00:00")`). */
const localStart = (day: string) => new Date(`${day}T00:00:00`);
const localEnd = (day: string) => new Date(`${day}T23:59:59.999`);

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export interface FactReaders {
  unmatchedBankLines(month: string): Promise<number>;
  settlementsOpen(month: string): Promise<number>;
  cashAccountsNotCounted(month: string): Promise<number>;
  payroll(month: string): Promise<{ approved: boolean; duesUnpaid: number }>;
  cleanup(month: string): Promise<{ bills: number; receipts: number; entries: number }>;
  accrual(): Promise<{ on: false } | { on: true; missing: number; difference: number }>;
  trialBalance(month: string): Promise<{ balanced: boolean; totalDebits: number; totalCredits: number }>;
}

const readers: FactReaders = {
  async unmatchedBankLines(month) {
    const { from, to } = monthBounds(month);
    const db = await getDb();
    return db.collection(BANK_STATEMENT_LINES_COLLECTION).countDocuments({ ...notDeleted, statementDate: { $gte: localStart(from), $lte: localEnd(to) }, status: { $in: ["unmatched", "partially_matched", "duplicate", "needs_review"] } });
  },
  async settlementsOpen(month) {
    const { from, to } = monthBounds(month);
    const db = await getDb();
    return db.collection(SETTLEMENTS_COLLECTION).countDocuments({ ...notDeleted, settledOn: { $gte: from, $lte: to }, status: { $in: ["ready", "review"] } });
  },
  async cashAccountsNotCounted(month) {
    const { from, to } = monthBounds(month);
    const accounts = await listCashAccounts({ status: "active" });
    if (accounts.length === 0) return 0;
    const db = await getDb();
    const counted = await db.collection<{ cashAccountId: string }>(CASH_COUNTS_COLLECTION).distinct("cashAccountId", { ...notDeleted, countDate: { $gte: localStart(from), $lte: localEnd(to) } });
    const have = new Set(counted);
    return accounts.filter((a) => !have.has(a._id)).length;
  },
  async payroll(month) {
    const db = await getDb();
    const approved = (await db.collection(PAYROLL_RUNS_COLLECTION).countDocuments({ month, status: { $in: ["approved", "paid"] } })) > 0;
    if (!approved) return { approved: false, duesUnpaid: 0 };
    const d = await duesForMonth(month);
    if (!d) throw new Error("Payroll dues could not be read");
    return { approved: true, duesUnpaid: d.dues.filter((x) => x.status !== "paid" && x.status !== "nothing_due").length };
  },
  async cleanup(month) {
    const { from } = monthBounds(month);
    const r = await cleanupReport();
    // The report lists newest first and stops at 500: if it stopped inside or after this month we cannot prove the month is clear.
    const oldest = r.unclassified.length ? r.unclassified[r.unclassified.length - 1].date : null;
    if (r.unclassified.length >= 500 && oldest !== null && oldest > from) throw new Error("Too many entries to check this month");
    return {
      bills: r.billsWithoutDocument.filter((b) => dateInMonth(b.invoiceDate, month)).length,
      receipts: r.receiptsWithoutProof.filter((x) => dateInMonth(x.date, month)).length,
      entries: r.unclassified.filter((x) => dateInMonth(x.date, month)).length,
    };
  },
  async accrual() {
    if (!(await getAccrualSettings())) return { on: false };
    const [missing, tie] = await Promise.all([countMissingAccruals(), accrualTieOut()]);
    // switched on but unreadable is not "agrees"
    if (missing === null || tie === null) throw new Error("Accrual books could not be read");
    return { on: true, missing, difference: Math.round((Math.abs(tie.receivable.difference) + Math.abs(tie.payable.difference)) * 100) / 100 };
  },
  async trialBalance(month) {
    const tb = await getTrialBalance({ asOf: localEnd(monthBounds(month).to) });
    return { balanced: tb.balanced, totalDebits: tb.totalDebits, totalCredits: tb.totalCredits };
  },
};

/** Each reading stands alone: if one fails its fact stays undefined, which the core treats as "could not check", never as passed. */
export async function gatherMonthFacts(month: string, override: Partial<FactReaders> = {}): Promise<MonthCloseFacts> {
  const r = { ...readers, ...override };
  const attempt = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  };
  const [bank, settle, cash, payroll, clean, accrual, tb] = await Promise.all([
    attempt(() => r.unmatchedBankLines(month)),
    attempt(() => r.settlementsOpen(month)),
    attempt(() => r.cashAccountsNotCounted(month)),
    attempt(() => r.payroll(month)),
    attempt(() => r.cleanup(month)),
    attempt(() => r.accrual()),
    attempt(() => r.trialBalance(month)),
  ]);
  const facts: MonthCloseFacts = {};
  if (bank !== undefined) facts.unmatchedBankLines = bank;
  if (settle !== undefined) facts.settlementsOpen = settle;
  if (cash !== undefined) facts.cashAccountsNotCounted = cash;
  if (payroll) Object.assign(facts, { payrollApproved: payroll.approved, statutoryDuesUnpaid: payroll.duesUnpaid });
  if (clean) Object.assign(facts, { billsWithoutDocument: clean.bills, receiptsWithoutProof: clean.receipts, entriesWithoutAccount: clean.entries });
  if (accrual) facts.accrual = accrual;
  if (tb) facts.trialBalance = tb;
  return facts;
}

// ---------------------------------------------------------------------------
// Recorded steps and overrides
// ---------------------------------------------------------------------------

const toRecord = (d: StepDoc): StepRecord => ({ stepKey: d.stepKey, note: d.note, recordedBy: d.recordedBy, recordedByEmail: d.recordedByEmail, recordedAt: d.recordedAt.toISOString() });

export async function listStepRecords(month: string): Promise<{ records: StepRecord[]; override: OverrideRecord | null }> {
  if (!isMonthString(month)) return { records: [], override: null };
  const rows = await (await col()).find({ month, ...notDeleted }).toArray();
  const o = rows.find((r) => r.stepKey === OVERRIDE_KEY);
  return {
    records: rows.filter((r) => r.stepKey !== OVERRIDE_KEY).map(toRecord),
    override: o ? { reason: o.note ?? "", coveredKeys: o.coveredKeys ?? [], recordedBy: o.recordedBy, recordedByEmail: o.recordedByEmail, recordedAt: o.recordedAt.toISOString() } : null,
  };
}

/** One row per month + step even when two people save at once: upsert, and on the rare duplicate-key race, update the row that won. */
async function upsertRow(month: string, stepKey: string, fields: { note: string | null; coveredKeys?: string[] }, actor: Actor) {
  const c = await col();
  const now = new Date();
  const stamp = createStamp(actor.id);
  const run = () =>
    c.updateOne(
      { month, stepKey },
      {
        $set: { note: fields.note, ...(fields.coveredKeys ? { coveredKeys: fields.coveredKeys } : {}), recordedBy: actor.id, recordedByEmail: actor.email, recordedAt: now, ...updateStamp(actor.id), deletedAt: null },
        $setOnInsert: { _id: newId(), createdAt: stamp.createdAt, createdBy: actor.id },
      },
      { upsert: true }
    );
  try {
    await run();
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    await run();
  }
}

const refusedFuture = (month: string) => (month > currentMonthIst() ? `${monthLabel(month)} has not started yet.` : null);

export async function recordStep(month: string, stepKey: string, noteInput: unknown, actor: Actor): Promise<Result> {
  if (!isMonthString(month)) return { ok: false, error: "Choose a valid month." };
  if (!isPersonStepKey(stepKey)) return { ok: false, error: "That step is checked by the books, it cannot be ticked by hand." };
  const future = refusedFuture(month);
  if (future) return { ok: false, error: future };
  const note = validateNote(noteInput);
  if (!note.ok) return note;
  if ((await listFiscalPeriodState(month)).state === "closed") return { ok: false, error: "This month is already locked." };
  await upsertRow(month, stepKey, { note: note.value }, actor);
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "record", entity: "fiscal_period", entityId: `month-close-${month}`, entityLabel: monthLabel(month), summary: `month close step "${stepKey}" marked done${note.value ? `: ${note.value}` : ""}` });
  return { ok: true };
}

export async function clearStep(month: string, stepKey: string, actor: Actor): Promise<Result> {
  if (!isMonthString(month)) return { ok: false, error: "Choose a valid month." };
  if (!isPersonStepKey(stepKey)) return { ok: false, error: "That step cannot be cleared." };
  if ((await listFiscalPeriodState(month)).state === "closed") return { ok: false, error: "This month is already locked." };
  const r = await (await col()).deleteOne({ month, stepKey });
  if (r.deletedCount) await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "fiscal_period", entityId: `month-close-${month}`, entityLabel: monthLabel(month), summary: `month close step "${stepKey}" marked not done` });
  return { ok: true };
}

/** Matches only a period that is exactly this month (1st to last day, in the server's calendar like it was saved). */
export async function listFiscalPeriodState(month: string): Promise<PeriodState> {
  const { from, to } = monthBounds(month);
  // a period saved without proper dates (an old or hand-made record) is skipped rather than allowed to break the page
  const periods = (await listFiscalPeriods()).map((p) => ({ p, start: safeDay(p.startDate), end: safeDay(p.endDate) })).filter((x): x is { p: typeof x.p; start: string; end: string } => !!x.start && !!x.end);
  const exact = periods.find((x) => x.start === from && x.end === to);
  if (exact) return { state: exact.p.status, id: exact.p._id, name: exact.p.name };
  const overlapping = periods.find((x) => x.start <= to && x.end >= from);
  return overlapping ? { state: "mismatch", name: overlapping.p.name } : { state: "none" };
}

// ---------------------------------------------------------------------------
// The whole picture
// ---------------------------------------------------------------------------

export interface MonthCloseView {
  month: string;
  steps: StepView[];
  period: PeriodState;
  override: OverrideRecord | null;
  decision: LockDecision;
  blockingKeys: string[];
  today: string;
}

export async function getMonthClose(month: string, readerOverride: Partial<FactReaders> = {}): Promise<MonthCloseView> {
  const today = todayIst();
  const [facts, { records, override }, period] = await Promise.all([gatherMonthFacts(month, readerOverride), listStepRecords(month), listFiscalPeriodState(month)]);
  const steps = evaluateSteps(facts, records);
  const blocking = blockingSteps(steps);
  return { month, steps, period, override, decision: decideLock({ month, today, period, blocking, override }), blockingKeys: blocking.map((s) => s.key), today };
}

/** Lets a permitted person lock a month although some checks do not pass. The reason is stored, shown on the page and audit-logged. */
export async function recordOverride(month: string, reasonInput: unknown, actor: Actor, readerOverride: Partial<FactReaders> = {}): Promise<Result> {
  if (!isMonthString(month)) return { ok: false, error: "Choose a valid month." };
  const reason = validateOverrideReason(reasonInput);
  if (!reason.ok) return reason;
  const view = await getMonthClose(month, readerOverride);
  if (view.period.state === "closed") return { ok: false, error: "This month is already locked." };
  // Computed here from the books, never taken from the browser.
  if (view.blockingKeys.length === 0) return { ok: false, error: "Every check passes, so there is nothing to override." };
  await upsertRow(month, OVERRIDE_KEY, { note: reason.value, coveredKeys: view.blockingKeys }, actor);
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "record", entity: "fiscal_period", entityId: `month-close-${month}`, entityLabel: monthLabel(month), summary: `month close override recorded for ${view.blockingKeys.join(", ")}: ${reason.value}` });
  return { ok: true };
}

export async function removeOverride(month: string, actor: Actor): Promise<Result> {
  if (!isMonthString(month)) return { ok: false, error: "Choose a valid month." };
  if ((await listFiscalPeriodState(month)).state === "closed") return { ok: false, error: "This month is already locked." };
  const r = await (await col()).deleteOne({ month, stepKey: OVERRIDE_KEY });
  if (r.deletedCount) await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "fiscal_period", entityId: `month-close-${month}`, entityLabel: monthLabel(month), summary: "month close override removed" });
  return { ok: true };
}

/** Locks through the existing fiscal-period close (which posts the real closing entry). Refuses unless the decision allows it. */
export async function lockMonth(month: string, actor: Actor, readerOverride: Partial<FactReaders> = {}): Promise<Result<{ overridden: boolean }>> {
  if (!isMonthString(month)) return { ok: false, error: "Choose a valid month." };
  const view = await getMonthClose(month, readerOverride);
  if (!view.decision.allowed) return { ok: false, error: view.decision.reason ?? "This month cannot be locked yet." };
  if (view.period.state !== "open") return { ok: false, error: "This month cannot be locked yet." };
  const r = await closePeriod(view.period.id, actor.id, actor.email);
  if (!r.ok) return { ok: false, error: r.reason };
  if (view.decision.overridden && view.override) {
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "status_change", entity: "fiscal_period", entityId: view.period.id, entityLabel: view.period.name, summary: `locked ${monthLabel(month)} with failing checks (${view.blockingKeys.join(", ")}). Reason by ${view.override.recordedByEmail ?? view.override.recordedBy}: ${view.override.reason}` });
  }
  return { ok: true, overridden: view.decision.overridden };
}
