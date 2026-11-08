import assert from "node:assert/strict";
import { checkExpense, checkOvertime, checkShortLeave, minutesBetween, rangesOverlap, type RequestLimits } from "../src/lib/products/talentos/work-request-rules";
import { computePaidDays, DEFAULT_PAID_DAYS_POLICY, type PaidDaysDay } from "../src/lib/products/talentos/payroll/paid-days";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const L: RequestLimits = { overtimeEnabled: true, overtimeMaxMinutesPerDay: 240, overtimeMaxMinutesPerMonth: 600, shortLeavesPerMonth: 2, shortLeaveMaxMinutes: 240, expenseMaxAgeDays: 60 };
const today = "2026-09-20";

t("minutes between two times", () => {
  assert.equal(minutesBetween("10:00", "12:30"), 150);
  assert.equal(minutesBetween("12:00", "10:00"), null);
  assert.equal(minutesBetween("25:00", "26:00"), null);
  assert.ok(rangesOverlap({ from: "10:00", to: "12:00" }, { from: "11:00", to: "13:00" }));
  assert.ok(!rangesOverlap({ from: "10:00", to: "12:00" }, { from: "12:00", to: "13:00" }));
});

t("overtime: only after the work, within the day and month limits", () => {
  const ok = { minutes: 120, date: "2026-09-18", today, dayUsed: 0, monthUsed: 0 };
  assert.equal(checkOvertime(ok, L), null);
  assert.ok(checkOvertime({ ...ok, date: "2026-09-25" }, L)?.includes("after the work"));
  assert.ok(checkOvertime({ ...ok, date: "2026-07-01" }, L)?.includes("45 days"));
  assert.ok(checkOvertime({ ...ok, minutes: 10 }, L)?.includes("15 minutes"));
  assert.ok(checkOvertime({ ...ok, minutes: 200, dayUsed: 100 }, L)?.includes("for a day"));
  assert.ok(checkOvertime({ ...ok, monthUsed: 520 }, L)?.includes("limit of"));
  assert.ok(checkOvertime(ok, { ...L, overtimeEnabled: false })?.includes("does not pay"));
});

t("partial leave: two a month, within the length, on a working day", () => {
  const ok = { date: "2026-09-22", fromTime: "10:00", toTime: "12:00", today, isWorkingDay: true, countThisMonth: 1, overlapsExisting: false, coveredByLeave: false };
  assert.equal(checkShortLeave(ok, L), null);
  assert.ok(checkShortLeave({ ...ok, countThisMonth: 2 }, L)?.includes("used your 2"));
  assert.ok(checkShortLeave({ ...ok, toTime: "15:00" }, L)?.includes("at most 4"));
  assert.ok(checkShortLeave({ ...ok, isWorkingDay: false }, L)?.includes("weekly off"));
  assert.ok(checkShortLeave({ ...ok, coveredByLeave: true }, L)?.includes("already have a leave"));
  assert.ok(checkShortLeave({ ...ok, overlapsExisting: true }, L)?.includes("at that time"));
  assert.ok(checkShortLeave({ ...ok, fromTime: "12:00", toTime: "11:00" }, L)?.includes("later end time"));
  assert.ok(checkShortLeave(ok, { ...L, shortLeavesPerMonth: 0 })?.includes("does not offer"));
});

t("expense claims need a bill, a valid amount and to be filed in time", () => {
  const ok = { amount: 4500, billDate: "2026-09-10", today, category: "subscription", title: "Design tool", vendor: "Acme Software", billNumber: "INV-221" };
  assert.equal(checkExpense(ok, L), null);
  assert.ok(checkExpense({ ...ok, billNumber: " " }, L)?.includes("bill or invoice number"));
  assert.ok(checkExpense({ ...ok, billDate: "2026-06-01" }, L)?.includes("within 60 days"));
  assert.ok(checkExpense({ ...ok, billDate: "2026-09-30" }, L)?.includes("future"));
  assert.ok(checkExpense({ ...ok, amount: 0 }, L)?.includes("amount"));
  assert.ok(checkExpense({ ...ok, category: "yacht" }, L)?.includes("what the money"));
});

// September 2026: the 1st is a Tuesday.
const month = "2026-09";
const day = (n: number, extra: Partial<PaidDaysDay> = {}): PaidDaysDay => {
  const date = `${month}-${String(n).padStart(2, "0")}`;
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, kind: dow === 0 || dow === 6 ? "weekly_off" : "working", attendance: dow === 0 || dow === 6 ? "none" : "present", leave: null, workedMinutes: 480, ...extra };
};
const days = (over: Record<number, Partial<PaidDaysDay>> = {}) => Array.from({ length: 30 }, (_, i) => day(i + 1, over[i + 1]));
const policy = (o: Partial<typeof DEFAULT_PAID_DAYS_POLICY.overtime> = {}, late = 0) => ({ ...DEFAULT_PAID_DAYS_POLICY, lateMarksPerHalfDay: late, overtime: { enabled: true, afterMinutesPerDay: 480, multiplier: 2, holidayMultiplier: 2, ...o } });

t("approved partial leave stops a half-day mark costing pay", () => {
  const without = computePaidDays({ month, joinDate: null, exitDate: null, days: days({ 8: { attendance: "half_day", workedMinutes: 240 } }), policy: policy() });
  const withShort = computePaidDays({ month, joinDate: null, exitDate: null, days: days({ 8: { attendance: "half_day", workedMinutes: 240, shortLeave: true } }), policy: policy() });
  assert.equal(without.halfDayLop, 0.5);
  assert.equal(withShort.halfDayLop, 0);
  assert.ok(withShort.paidDays > without.paidDays);
});

t("approved partial leave excuses a late mark", () => {
  const late = (short: boolean) => computePaidDays({ month, joinDate: null, exitDate: null, days: days({ 1: { isLate: true, shortLeave: short }, 2: { isLate: true, shortLeave: short } }), policy: policy({}, 2) });
  assert.equal(late(false).lateLop, 0.5);
  assert.equal(late(true).lateLop, 0);
});

t("with approval required, attendance hours earn no overtime; only approved hours do", () => {
  const long = days({ 3: { workedMinutes: 700 }, 4: { workedMinutes: 700 } });
  const fromAtt = computePaidDays({ month, joinDate: null, exitDate: null, days: long, policy: policy() });
  assert.equal(fromAtt.overtimeMinutes, 440);
  const gated = computePaidDays({ month, joinDate: null, exitDate: null, days: long, policy: policy({ fromAttendance: false }) });
  assert.equal(gated.overtimeMinutes, 0);
  const approved = computePaidDays({ month, joinDate: null, exitDate: null, days: long, policy: policy({ fromAttendance: false }), approvedOvertime: { regularMinutes: 120, holidayMinutes: 180 } });
  assert.equal(approved.overtimeMinutes, 120);
  assert.equal(approved.holidayWorkedMinutes, 180);
  assert.ok(approved.notes.some((n) => n.includes("Overtime: 5 hour")));
  const off = computePaidDays({ month, joinDate: null, exitDate: null, days: long, policy: policy({ enabled: false }), approvedOvertime: { regularMinutes: 120, holidayMinutes: 0 } });
  assert.equal(off.overtimeMinutes, 0);
});

console.log("work request tests passed");
