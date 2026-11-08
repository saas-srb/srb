import assert from "node:assert/strict";
import {
  STEPS, STEP_KEYS, blockingSteps, checkDataStep, dateInMonth, decideLock, defaultCloseMonth, evaluateSteps, indiaFiscalYear, isMonthString, isPersonStepKey,
  monthBounds, monthHasEnded, monthLabel, overrideCovers, progressOf, shiftMonth, todayIst, validateNote, validateOverrideReason,
  type MonthCloseFacts, type OverrideRecord, type StepRecord,
} from "../src/lib/products/cashflow-ai/month-close/core";

// Pure: no database.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const clean: MonthCloseFacts = { unmatchedBankLines: 0, settlementsOpen: 0, cashAccountsNotCounted: 0, payrollApproved: true, statutoryDuesUnpaid: 0, billsWithoutDocument: 0, receiptsWithoutProof: 0, entriesWithoutAccount: 0, accrual: { on: false }, trialBalance: { balanced: true, totalDebits: 10, totalCredits: 10 } };
const status = (f: MonthCloseFacts) => Object.fromEntries(evaluateSteps(f, []).map((s) => [s.key, s.status]));
const ov = (keys: string[]): OverrideRecord => ({ reason: "Audit done offline by CA", coveredKeys: keys, recordedBy: "u1", recordedByEmail: "a@b.c", recordedAt: "2026-02-01T00:00:00.000Z" });

t("month strings are strict", () => {
  for (const ok of ["2026-01", "2026-12", "2000-01", "2100-12"]) assert.ok(isMonthString(ok), ok);
  for (const bad of ["2026-13", "2026-00", "2026-1", "26-01", "2026-01-01", "1999-12", "2101-01", "", null, 202601, undefined]) assert.equal(isMonthString(bad), false, String(bad));
});

t("month ends: 31 Jan, 28/29 Feb leap years, 30 Apr, 31 Dec", () => {
  assert.equal(monthBounds("2026-01").to, "2026-01-31");
  assert.equal(monthBounds("2026-02").to, "2026-02-28");
  assert.equal(monthBounds("2024-02").to, "2024-02-29");
  assert.equal(monthBounds("2100-02").to, "2100-02-28", "2100 is not a leap year");
  assert.equal(monthBounds("2000-02").to, "2000-02-29", "2000 is a leap year");
  assert.equal(monthBounds("2026-04").to, "2026-04-30");
  assert.deepEqual(monthBounds("2026-12"), { from: "2026-12-01", to: "2026-12-31", days: 31 });
  assert.throws(() => monthBounds("2026-13"));
});

t("shifting months crosses year ends both ways", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(shiftMonth("2026-03", -15), "2024-12");
  assert.equal(shiftMonth("2026-03", 0), "2026-03");
});

t("today is the India date, not the UTC date", () => {
  assert.equal(todayIst(new Date("2026-01-31T18:29:59Z")), "2026-01-31");
  assert.equal(todayIst(new Date("2026-01-31T18:30:00Z")), "2026-02-01", "18:30 UTC is midnight in India");
  assert.equal(todayIst(new Date("2025-12-31T20:00:00Z")), "2026-01-01", "new year arrives in India first");
  assert.equal(defaultCloseMonth(new Date("2026-01-31T19:00:00Z")), "2026-01", "1 Feb in India: close January");
  assert.equal(defaultCloseMonth(new Date("2026-01-15T10:00:00Z")), "2025-12");
});

t("a month has ended only after its last day", () => {
  assert.equal(monthHasEnded("2026-01", "2026-01-31"), false);
  assert.equal(monthHasEnded("2026-01", "2026-02-01"), true);
  assert.equal(monthHasEnded("2024-02", "2024-02-29"), false);
  assert.equal(monthHasEnded("2024-02", "2024-03-01"), true);
  assert.equal(monthHasEnded("2025-12", "2026-01-01"), true);
  assert.equal(monthHasEnded("2026-11", "2026-10-28"), false, "future month");
  assert.equal(monthHasEnded("2026-01", "garbage"), false);
});

t("India financial year starts on 1 April", () => {
  assert.deepEqual(indiaFiscalYear("2026-03"), { label: "2025-26", startYear: 2025, monthNumber: 12 });
  assert.deepEqual(indiaFiscalYear("2026-04"), { label: "2026-27", startYear: 2026, monthNumber: 1 });
  assert.deepEqual(indiaFiscalYear("2026-01"), { label: "2025-26", startYear: 2025, monthNumber: 10 });
  assert.deepEqual(indiaFiscalYear("2026-12"), { label: "2026-27", startYear: 2026, monthNumber: 9 });
  assert.equal(indiaFiscalYear("2099-04").label, "2099-00", "century roll-over of the short year");
  assert.equal(monthLabel("2024-02"), "February 2024");
});

t("dateInMonth matches the month string, never a neighbour", () => {
  assert.ok(dateInMonth("2026-01-31", "2026-01"));
  assert.ok(!dateInMonth("2026-02-01", "2026-01"));
  assert.ok(!dateInMonth("2025-01-15", "2026-01"));
  assert.ok(!dateInMonth(null, "2026-01"));
});

t("catalog: keys are unique, the lock step is last, person steps are the right ones", () => {
  assert.equal(new Set(STEP_KEYS).size, STEP_KEYS.length);
  assert.equal(STEPS[STEPS.length - 1].key, "lock");
  assert.equal(STEPS.filter((s) => s.kind === "lock").length, 1);
  assert.ok(isPersonStepKey("depreciation_done"));
  assert.equal(isPersonStepKey("bank_reconciled"), false, "a data step cannot be ticked by hand");
  assert.equal(isPersonStepKey("lock"), false);
  assert.equal(isPersonStepKey("__override"), false);
  assert.equal(isPersonStepKey("nope"), false);
  const accrual = STEPS.find((s) => s.key === "accruals_reviewed")!;
  assert.match(accrual.help, /cash basis/);
  assert.equal(accrual.href, "/cashflow-ai/settings/accrual");
  assert.match(STEPS.find((s) => s.key === "gst_tds_reconciled")!.help, /not built yet/);
});

t("clean books: every data step passes, person steps are to do", () => {
  const s = evaluateSteps(clean, []);
  for (const x of s) assert.equal(x.status, x.kind === "data" ? "passed" : "todo", x.key);
  assert.equal(blockingSteps(s).length, 0);
});

t("each data step fails on its own fact", () => {
  const cases: [string, MonthCloseFacts][] = [
    ["bank_reconciled", { ...clean, unmatchedBankLines: 3 }],
    ["settlements_booked", { ...clean, settlementsOpen: 1 }],
    ["cash_counted", { ...clean, cashAccountsNotCounted: 2 }],
    ["payroll_done", { ...clean, payrollApproved: false }],
    ["payroll_done", { ...clean, statutoryDuesUnpaid: 2 }],
    ["bills_documented", { ...clean, billsWithoutDocument: 1 }],
    ["receipts_proved", { ...clean, receiptsWithoutProof: 4 }],
    ["entries_classified", { ...clean, entriesWithoutAccount: 1 }],
    ["accrual_in_ledger", { ...clean, accrual: { on: true, missing: 2, difference: 0 } }],
    ["accrual_in_ledger", { ...clean, accrual: { on: true, missing: 0, difference: 12.5 } }],
    ["trial_balance", { ...clean, trialBalance: { balanced: false, totalDebits: 11, totalCredits: 10 } }],
  ];
  for (const [key, f] of cases) {
    const st = status(f);
    assert.equal(st[key], "failing", key);
    assert.deepEqual(Object.entries(st).filter(([, v]) => v === "failing").map(([k]) => k), [key], "only that step fails");
  }
  assert.match(checkDataStep("bank_reconciled", { unmatchedBankLines: 1 }).detail, /^1 bank statement line of/);
  assert.match(checkDataStep("entries_classified", { entriesWithoutAccount: 2 }).detail, /^2 entries/);
});

t("an unreadable fact is never 'passed'", () => {
  assert.equal(Object.values(status({})).filter((v) => v === "passed").length, 0, "no facts at all: nothing passes");
  assert.equal(status({ ...clean, unmatchedBankLines: undefined }).bank_reconciled, "unknown");
  assert.equal(status({ ...clean, unmatchedBankLines: Number.NaN }).bank_reconciled, "unknown");
  assert.equal(status({ ...clean, payrollApproved: undefined }).payroll_done, "unknown");
  assert.equal(status({ ...clean, statutoryDuesUnpaid: undefined }).payroll_done, "unknown", "approved but dues unreadable");
  assert.equal(status({ ...clean, accrual: undefined }).accrual_in_ledger, "unknown");
  assert.equal(status({ ...clean, accrual: { on: true, missing: Number.NaN, difference: 0 } }).accrual_in_ledger, "unknown");
  assert.equal(status({ ...clean, accrual: { on: true, missing: 0, difference: 0 } }).accrual_in_ledger, "passed");
  assert.equal(status({ ...clean, trialBalance: undefined }).trial_balance, "unknown");
  assert.equal(blockingSteps(evaluateSteps({}, [])).length, STEPS.filter((s) => s.kind === "data").length, "unreadable blocks the lock");
});

t("person-recorded steps carry who and when", () => {
  const rec: StepRecord = { stepKey: "depreciation_done", note: "none this month", recordedBy: "u1", recordedByEmail: "x@y.z", recordedAt: "2026-02-02T00:00:00.000Z" };
  const s = evaluateSteps(clean, [rec, { ...rec, stepKey: "bank_reconciled" }]).find((x) => x.key === "depreciation_done")!;
  assert.equal(s.status, "recorded");
  assert.equal(s.record?.recordedByEmail, "x@y.z");
  assert.equal(evaluateSteps(clean, [{ ...rec, stepKey: "bank_reconciled" }]).find((x) => x.key === "bank_reconciled")!.status, "passed", "a stray record cannot tick a data step");
  assert.deepEqual(progressOf(evaluateSteps(clean, [rec])), { done: 10, total: 16, percent: 63 });
});

t("note and override-reason validation", () => {
  assert.deepEqual(validateNote("  hi  "), { ok: true, value: "hi" });
  assert.deepEqual(validateNote("   "), { ok: true, value: null });
  assert.deepEqual(validateNote(undefined), { ok: true, value: null });
  assert.equal(validateNote(5).ok, false);
  assert.equal(validateNote("x".repeat(501)).ok, false);
  assert.equal(validateNote("x".repeat(500)).ok, true);
  assert.equal(validateOverrideReason("").ok, false);
  assert.equal(validateOverrideReason("short").ok, false);
  assert.equal(validateOverrideReason(null).ok, false);
  assert.equal(validateOverrideReason("Nine char").ok, false);
  assert.deepEqual(validateOverrideReason("  CA signed off on it  "), { ok: true, value: "CA signed off on it" });
});

t("an override only covers the failures the person saw", () => {
  assert.equal(overrideCovers(["a"], null), false);
  assert.equal(overrideCovers(["a"], ov(["a", "b"])), true);
  assert.equal(overrideCovers(["a", "c"], ov(["a", "b"])), false, "a new failure is not covered");
  assert.equal(overrideCovers([], ov([])), true);
});

t("lock decision: not ended, no period, mismatch, closed, blocked, override, clean", () => {
  const failing = evaluateSteps({ ...clean, unmatchedBankLines: 2 }, []);
  const blocking = blockingSteps(failing);
  const open = { state: "open" as const, id: "p1", name: "Jan" };
  const base = { month: "2026-01", today: "2026-02-01", period: open, blocking: [], override: null };
  assert.equal(decideLock({ ...base, today: "2026-01-31" }).allowed, false, "last day itself is too early");
  assert.equal(decideLock({ ...base, today: "2026-01-31", blocking }).needsOverride, false, "an override cannot lock a month that has not ended");
  assert.match(decideLock({ ...base, period: { state: "none" } }).reason!, /Fiscal Periods/);
  assert.equal(decideLock({ ...base, period: { state: "mismatch", name: "FY" } }).allowed, false);
  assert.equal(decideLock({ ...base, period: { state: "closed", id: "p1", name: "Jan" } }).allowed, false);
  assert.deepEqual(decideLock({ ...base }), { allowed: true, needsOverride: false, overridden: false, reason: null });
  const blocked = decideLock({ ...base, blocking });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.needsOverride, true);
  const ok = decideLock({ ...base, blocking, override: ov(["bank_reconciled"]) });
  assert.equal(ok.allowed, true);
  assert.equal(ok.overridden, true);
  assert.equal(decideLock({ ...base, blocking, override: ov(["trial_balance"]) }).allowed, false, "override for a different step does not help");
  assert.equal(decideLock({ ...base, month: "2025-12", today: "2026-01-01" }).allowed, true, "31 Dec closes on 1 Jan");
});

console.log("month-close core: all passed");
