import assert from "node:assert/strict";
import { DEFAULT_PAID_DAYS_POLICY, computePaidDays, daysInMonth, type AttendanceMark, type DayKind, type PaidDaysDay, type PaidDaysPolicy } from "../src/lib/products/talentos/payroll/paid-days";

// Pure: no database. Run with: npx tsx scripts/test-payroll-days.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };

// March 2026: 1 March is a Sunday. Saturdays and Sundays are weekly offs: 9 off days, 22 working days, 31 calendar days.
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");
const range = (from: string, to: string) => { const out: string[] = []; for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
interface Opt { holidays?: string[]; absent?: string[]; none?: string[]; half?: string[]; leave?: Record<string, { fraction: number; paid: boolean }>; late?: string[]; minutes?: Record<string, number>; marks?: Record<string, AttendanceMark>; padDays?: boolean }
function month(m: string, o: Opt = {}): PaidDaysDay[] {
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const from = o.padDays ? new Date(Date.UTC(y, mo - 1, 1) - 3 * 86400000).toISOString().slice(0, 10) : `${m}-01`;
  const to = o.padDays ? new Date(Date.UTC(y, mo - 1, last) + 3 * 86400000).toISOString().slice(0, 10) : `${m}-${pad(last)}`;
  return range(from, to).map((date) => {
    const kind: DayKind = o.holidays?.includes(date) ? "holiday" : [0, 6].includes(dow(date)) ? "weekly_off" : "working";
    let attendance: AttendanceMark = kind === "working" ? "present" : "none";
    if (o.absent?.includes(date)) attendance = "absent";
    if (o.none?.includes(date)) attendance = "none";
    if (o.half?.includes(date)) attendance = "half_day";
    if (o.marks?.[date]) attendance = o.marks[date];
    return { date, kind, attendance, leave: o.leave?.[date] ?? null, isLate: o.late?.includes(date), workedMinutes: o.minutes?.[date] ?? (kind === "working" ? 480 : 0) };
  });
}
const run = (days: PaidDaysDay[], policy: Partial<PaidDaysPolicy> = {}, extra: { joinDate?: string | null; exitDate?: string | null; month?: string } = {}) =>
  computePaidDays({ month: extra.month ?? "2026-03", joinDate: extra.joinDate ?? null, exitDate: extra.exitDate ?? null, days, policy: { ...DEFAULT_PAID_DAYS_POLICY, ...policy } });

t("days in a month", () => { assert.equal(daysInMonth("2026-02"), 28); assert.equal(daysInMonth("2028-02"), 29); assert.equal(daysInMonth("2026-03"), 31); });
t("a full month with every working day present is paid in full", () => {
  const r = run(month("2026-03"));
  assert.deepEqual([r.monthDays, r.employedDays, r.workingDays, r.weeklyOffs, r.lopDays, r.paidDays, r.payFactor], [31, 31, 22, 9, 0, 31, 1]);
});
t("absent days are lost pay: 2 absences in a 31-day month pay 29/31", () => {
  const r = run(month("2026-03", { absent: ["2026-03-10", "2026-03-11"] }));
  assert.deepEqual([r.absentDays, r.lopDays, r.paidDays], [2, 2, 29]);
  assert.equal(r.payFactor, Math.round((29 / 31) * 1e6) / 1e6);
});
t("holidays and weekly offs are paid, a holiday is not a working day", () => {
  const r = run(month("2026-03", { holidays: ["2026-03-04"], absent: ["2026-03-04"] }));
  assert.deepEqual([r.holidays, r.workingDays, r.lopDays], [1, 21, 0]);
});
t("paid leave is paid, unpaid leave is lost pay, half-day unpaid leave costs half a day", () => {
  const r = run(month("2026-03", { leave: { "2026-03-09": { fraction: 1, paid: true }, "2026-03-10": { fraction: 1, paid: false }, "2026-03-11": { fraction: 0.5, paid: false } }, marks: { "2026-03-09": "on_leave", "2026-03-10": "on_leave", "2026-03-11": "on_leave" } }));
  assert.deepEqual([r.paidLeaveDays, r.unpaidLeaveDays, r.lopDays], [1, 1.5, 1.5]);
});
t("half-day attendance costs half a day", () => {
  const r = run(month("2026-03", { half: ["2026-03-12", "2026-03-13"] }));
  assert.deepEqual([r.halfDayLop, r.lopDays], [1, 1]);
});
t("a working day nobody marked: lost pay by default, paid if the policy assumes the employee worked", () => {
  assert.equal(run(month("2026-03", { none: ["2026-03-12"] })).lopDays, 1);
  assert.equal(run(month("2026-03", { none: ["2026-03-12"] }), { unmarkedDay: "present" }).lopDays, 0);
});
t("joining in the middle of the month: paid from the joining date, on every basis", () => {
  const days = month("2026-03");
  const cal = run(days, {}, { joinDate: "2026-03-16" });
  assert.deepEqual([cal.employedDays, cal.workingDays, cal.paidDays, cal.payFactor], [16, 12, 16, Math.round((16 / 31) * 1e6) / 1e6]);
  const fixed = run(days, { basis: "fixed", fixedDays: 30 }, { joinDate: "2026-03-16" });
  assert.equal(fixed.paidDays, 15, "31 days less 16 outside... capped to the 30-day basis");
  const working = run(days, { basis: "working" }, { joinDate: "2026-03-16" });
  assert.deepEqual([working.basisDays, working.paidDays], [22, 12]);
});
t("leaving in the middle of the month: paid to the last working day", () => {
  const r = run(month("2026-03"), {}, { exitDate: "2026-03-20" });
  assert.deepEqual([r.employedDays, r.paidDays, r.notes.some((n) => n.includes("Last working day"))], [20, 20, true]);
});
t("fixed 30-day basis: a full 28-day February or 31-day March is a full month; losses are counted against 30", () => {
  const feb = run(month("2026-02"), { basis: "fixed", fixedDays: 30 }, { month: "2026-02" });
  assert.deepEqual([feb.paidDays, feb.payFactor], [30, 1]);
  const mar = run(month("2026-03", { absent: ["2026-03-10", "2026-03-11"] }), { basis: "fixed", fixedDays: 30 });
  assert.equal(mar.paidDays, 28);
});
t("working-day basis: 2 absences in 22 working days pay 20/22", () => {
  const r = run(month("2026-03", { absent: ["2026-03-10", "2026-03-11"] }), { basis: "working" });
  assert.deepEqual([r.basisDays, r.paidDays, r.payFactor], [22, 20, Math.round((20 / 22) * 1e6) / 1e6]);
});
t("sandwich rule: the weekend between two days of loss of pay is unpaid", () => {
  const days = month("2026-03", { absent: ["2026-03-06", "2026-03-09"] }); // Friday and Monday
  assert.equal(run(days, { sandwich: "none" }).lopDays, 2);
  const all = run(days, { sandwich: "all_lop" });
  assert.deepEqual([all.sandwichDays, all.lopDays], [2, 4]);
  assert.equal(run(days, { sandwich: "unpaid_leave" }).sandwichDays, 0, "absence is not unpaid leave");
  const leave = month("2026-03", { marks: { "2026-03-06": "on_leave", "2026-03-09": "on_leave" }, leave: { "2026-03-06": { fraction: 1, paid: false }, "2026-03-09": { fraction: 1, paid: false } } });
  assert.deepEqual([run(leave, { sandwich: "unpaid_leave" }).sandwichDays, run(leave, { sandwich: "unpaid_leave" }).lopDays], [2, 4]);
});
t("sandwich rule: a holiday between two days of loss of pay, and no sandwich when one side is worked", () => {
  const days = month("2026-03", { holidays: ["2026-03-04"], absent: ["2026-03-03", "2026-03-05"] });
  assert.equal(run(days, { sandwich: "all_lop" }).sandwichDays, 1);
  const worked = month("2026-03", { holidays: ["2026-03-04"], absent: ["2026-03-03"] });
  assert.equal(run(worked, { sandwich: "all_lop" }).sandwichDays, 0);
});
t("sandwich rule sees across the month boundary but only the days inside the month are charged", () => {
  const days = month("2026-03", { padDays: true, absent: ["2026-02-27", "2026-03-02"] }); // Friday 27 Feb, Monday 2 March; 28 Feb and 1 March are the weekend
  assert.deepEqual([run(days, { sandwich: "all_lop" }).sandwichDays, run(days, { sandwich: "all_lop" }).lopDays], [1, 2]);
});
t("late marks: every N cost half a day", () => {
  const late = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-09", "2026-03-10"];
  const r = run(month("2026-03", { late }), { lateMarksPerHalfDay: 3 });
  assert.deepEqual([r.lateLop, r.lopDays], [1, 1]);
  assert.equal(run(month("2026-03", { late })).lateLop, 0);
});
t("overtime beyond the day's hours, and work on a weekly off", () => {
  const days = month("2026-03", { minutes: { "2026-03-02": 600, "2026-03-03": 540, "2026-03-04": 480, "2026-03-07": 300 }, marks: { "2026-03-07": "present" } });
  const r = run(days, { overtime: { enabled: true, afterMinutesPerDay: 480, multiplier: 2, holidayMultiplier: 2 } });
  assert.deepEqual([r.overtimeMinutes, r.holidayWorkedMinutes], [180, 300]);
  assert.equal(run(days).overtimeMinutes, 0, "off unless the policy turns it on");
});
t("loss of pay can never exceed the days employed", () => {
  const days = month("2026-03", { absent: range("2026-03-01", "2026-03-31") });
  const r = run(days, {}, { joinDate: "2026-03-20" });
  assert.equal(r.lopDays <= r.employedDays, true);
  assert.equal(r.paidDays, 4, "the 4 weekend days inside the employment are still paid when the sandwich rule is off");
  const strict = run(days, { sandwich: "all_lop" }, { joinDate: "2026-03-20" });
  assert.equal(strict.paidDays, 0);
});
console.log("payroll days tests passed");
