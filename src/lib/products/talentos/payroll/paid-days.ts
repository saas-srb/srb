/**
 * From a month's attendance, leave, weekly offs and holidays to the number of days an employee is paid for. Pure: no I/O.
 *
 * The month is read day by day. Each day of the month is, for this employee, one of:
 *   - outside employment (before the joining date or after the last working day): not paid;
 *   - a weekly off or a holiday: paid, unless the sandwich rule turns it into loss of pay;
 *   - a working day: paid in full, in part (half-day, half-day leave) or not at all (absent, unpaid leave, unmarked when the policy says so).
 *
 * "Loss of pay" (LOP) is whatever part of a working day is not paid. Pay is then a share of the month's pay: the number of paid days over the
 * days of the basis the company chose (calendar days of the month, working days, or a fixed 26 / 30).
 */

export type DayKind = "working" | "weekly_off" | "holiday";
export type AttendanceMark = "present" | "half_day" | "absent" | "on_leave" | "none";

export interface PaidDaysDay {
  date: string;
  kind: DayKind;
  attendance: AttendanceMark;
  /** Approved leave on this date: the part of the day it covers (1, or 0.5 for a half-day) and whether the leave type is paid. */
  leave: { fraction: number; paid: boolean } | null;
  workedMinutes?: number;
  isLate?: boolean;
  /** An approved partial (short) leave falls on this day: it is paid, so a late mark or a half-day mark on the same day costs nothing. */
  shortLeave?: boolean;
}

export interface PaidDaysPolicy {
  /** What a day's pay is a share of: "calendar" (days in the month), "working" (working days in the month) or "fixed" (`fixedDays`, usually 26 or 30). */
  basis: "calendar" | "working" | "fixed";
  fixedDays: number;
  /**
   * Weekly offs and holidays between two days of loss of pay:
   *   "none": paid; "unpaid_leave": unpaid when the days either side are unpaid leave; "all_lop": unpaid when the days either side are any loss of pay.
   */
  sandwich: "none" | "unpaid_leave" | "all_lop";
  /** A working day with no attendance mark: "lop" (not paid) or "present" (paid, the employee is assumed to have worked). */
  unmarkedDay: "lop" | "present";
  /** Every N late marks in a month cost half a day (0 = never). */
  lateMarksPerHalfDay: number;
  overtime: {
    enabled: boolean;
    afterMinutesPerDay: number;
    multiplier: number;
    holidayMultiplier: number;
    /** false: attendance hours earn nothing; only the approved overtime passed in `PaidDaysInput.approvedOvertime` is paid. Default true. */
    fromAttendance?: boolean;
  };
}

export const DEFAULT_PAID_DAYS_POLICY: PaidDaysPolicy = {
  basis: "calendar",
  fixedDays: 30,
  sandwich: "none",
  unmarkedDay: "lop",
  lateMarksPerHalfDay: 0,
  overtime: { enabled: false, afterMinutesPerDay: 480, multiplier: 2, holidayMultiplier: 2 },
};

export interface PaidDaysInput {
  /** "yyyy-mm". */
  month: string;
  /** First and last day of employment, "yyyy-mm-dd"; `null` = no limit on that side. `exitDate` is the last working day. */
  joinDate: string | null;
  exitDate: string | null;
  /** Every day of the month, plus (optionally) up to a week either side so the sandwich rule can see the neighbours. */
  days: PaidDaysDay[];
  policy: PaidDaysPolicy;
  /** Overtime that was requested and approved for the month (minutes): on working days, and on weekly offs / holidays. */
  approvedOvertime?: { regularMinutes: number; holidayMinutes: number };
}

export interface PaidDaysResult {
  monthDays: number;
  /** Days of the month the employee was employed (from joining to last working day). */
  employedDays: number;
  workingDays: number;
  weeklyOffs: number;
  holidays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  unmarkedDays: number;
  halfDayLop: number;
  lateLop: number;
  sandwichDays: number;
  lopDays: number;
  /** Days paid for, in the sense of the chosen basis. */
  paidDays: number;
  /** The number of days the month's pay is divided into. */
  basisDays: number;
  /** Share of the month's pay earned: 1 for a full month without loss of pay. */
  payFactor: number;
  overtimeMinutes: number;
  holidayWorkedMinutes: number;
  /** In words, for the payslip. */
  notes: string[];
}

const monthStart = (m: string) => `${m}-01`;
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`;
};

interface Resolved {
  paid: number;
  lop: number;
  /** Why the unpaid part is unpaid. */
  reason: "none" | "absent" | "unpaid_leave" | "unmarked" | "half_day" | "mixed";
}

/** A working day: how much of it is paid and how much is not. */
function resolveWorkingDay(day: PaidDaysDay, policy: PaidDaysPolicy): Resolved & { paidLeave: number; unpaidLeave: number; present: number; absent: number; unmarked: number; halfDay: number } {
  const f = day.leave ? Math.min(1, Math.max(0, day.leave.fraction)) : 0;
  const paidLeave = day.leave?.paid ? f : 0;
  const unpaidLeave = day.leave && !day.leave.paid ? f : 0;
  const rest = 1 - f;
  let worked = 0;
  let present = 0;
  let absent = 0;
  let unmarked = 0;
  let halfDay = 0;
  if (rest > 0) {
    switch (day.attendance) {
      case "present":
        worked = rest;
        present = rest;
        break;
      case "half_day":
        if (day.shortLeave) {
          // A paid partial leave explains the shorter day.
          worked = rest;
          present = rest;
          break;
        }
        worked = rest * 0.5;
        present = rest * 0.5;
        halfDay = rest * 0.5;
        break;
      case "absent":
        absent = rest;
        break;
      case "on_leave":
        // Marked on leave, but no approved leave request covers it: treated as paid leave, never as a silent deduction.
        worked = rest;
        break;
      default:
        if (f > 0) {
          // The other half of a half-day leave: the employee is assumed to have worked it.
          worked = rest;
          present = rest;
        } else if (policy.unmarkedDay === "present") {
          worked = rest;
          present = rest;
        } else {
          unmarked = rest;
        }
    }
  }
  const paid = paidLeave + worked;
  const lop = 1 - paid;
  const reason: Resolved["reason"] = lop <= 1e-9 ? "none" : unpaidLeave > 0 && absent + unmarked + halfDay === 0 ? "unpaid_leave" : absent > 0 && unpaidLeave + unmarked + halfDay === 0 ? "absent" : unmarked > 0 && unpaidLeave + absent + halfDay === 0 ? "unmarked" : halfDay > 0 && unpaidLeave + absent + unmarked === 0 ? "half_day" : "mixed";
  return { paid, lop: Math.max(0, lop), reason, paidLeave, unpaidLeave, present, absent, unmarked, halfDay };
}

export function computePaidDays(input: PaidDaysInput): PaidDaysResult {
  const { month, policy } = input;
  const from = monthStart(month);
  const to = monthEnd(month);
  const monthDays = Number(to.slice(8, 10));
  const start = input.joinDate && input.joinDate > from ? input.joinDate : from;
  const end = input.exitDate && input.exitDate < to ? input.exitDate : to;
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const dates = [...byDate.keys()].sort();

  // Working days first: their resolved loss of pay decides the sandwich rule.
  const resolved = new Map<string, ReturnType<typeof resolveWorkingDay>>();
  for (const d of input.days) if (d.kind === "working") resolved.set(d.date, resolveWorkingDay(d, policy));

  const inEmployment = (date: string) => date >= start && date <= end && date >= from && date <= to;
  const isFullLop = (date: string, only?: "unpaid_leave") => {
    const r = resolved.get(date);
    if (!r || r.lop < 1 - 1e-9) return false;
    return only ? r.reason === only : true;
  };

  // The sandwich rule: a run of weekly offs / holidays with full loss of pay on the working day before and after it.
  const sandwiched = new Set<string>();
  if (policy.sandwich !== "none") {
    const only = policy.sandwich === "unpaid_leave" ? ("unpaid_leave" as const) : undefined;
    let i = 0;
    while (i < dates.length) {
      const d = byDate.get(dates[i])!;
      if (d.kind === "working") {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < dates.length && byDate.get(dates[j + 1])!.kind !== "working") j += 1;
      const before = i > 0 ? dates[i - 1] : null;
      const after = j + 1 < dates.length ? dates[j + 1] : null;
      if (before && after && isFullLop(before, only) && isFullLop(after, only)) for (let k = i; k <= j; k++) sandwiched.add(dates[k]);
      i = j + 1;
    }
  }

  const r: PaidDaysResult = {
    monthDays, employedDays: 0, workingDays: 0, weeklyOffs: 0, holidays: 0, presentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0,
    unmarkedDays: 0, halfDayLop: 0, lateLop: 0, sandwichDays: 0, lopDays: 0, paidDays: 0, basisDays: 0, payFactor: 0, overtimeMinutes: 0, holidayWorkedMinutes: 0, notes: [],
  };

  let lateMarks = 0;
  let workingDaysInMonth = 0;
  for (const d of input.days) {
    if (d.date < from || d.date > to) continue;
    if (d.kind === "working") workingDaysInMonth += 1;
    if (!inEmployment(d.date)) continue;
    r.employedDays += 1;
    if (d.kind === "weekly_off") r.weeklyOffs += 1;
    if (d.kind === "holiday") r.holidays += 1;
    if (d.kind !== "working") {
      if (sandwiched.has(d.date)) {
        r.sandwichDays += 1;
        r.lopDays += 1;
      }
      if (policy.overtime.enabled && policy.overtime.fromAttendance !== false && d.attendance === "present" && (d.workedMinutes ?? 0) > 0) r.holidayWorkedMinutes += d.workedMinutes ?? 0;
      continue;
    }
    r.workingDays += 1;
    const w = resolved.get(d.date)!;
    r.presentDays += w.present;
    r.paidLeaveDays += w.paidLeave;
    r.unpaidLeaveDays += w.unpaidLeave;
    r.absentDays += w.absent;
    r.unmarkedDays += w.unmarked;
    r.halfDayLop += w.halfDay;
    r.lopDays += w.lop;
    if (d.isLate && !d.shortLeave && (d.attendance === "present" || d.attendance === "half_day")) lateMarks += 1;
    if (policy.overtime.enabled && policy.overtime.fromAttendance !== false && d.attendance === "present") r.overtimeMinutes += Math.max(0, (d.workedMinutes ?? 0) - policy.overtime.afterMinutesPerDay);
  }

  if (policy.overtime.enabled && input.approvedOvertime) {
    r.overtimeMinutes += Math.max(0, Math.round(input.approvedOvertime.regularMinutes));
    r.holidayWorkedMinutes += Math.max(0, Math.round(input.approvedOvertime.holidayMinutes));
  }

  if (policy.lateMarksPerHalfDay > 0) {
    r.lateLop = Math.floor(lateMarks / policy.lateMarksPerHalfDay) * 0.5;
    r.lopDays += r.lateLop;
  }
  r.lopDays = Math.min(r.lopDays, r.employedDays);

  // Pay as a share of the month.
  const outside = monthDays - r.employedDays;
  if (policy.basis === "calendar") {
    r.basisDays = monthDays;
    r.paidDays = Math.max(0, r.employedDays - r.lopDays);
  } else if (policy.basis === "fixed") {
    r.basisDays = Math.max(1, policy.fixedDays);
    r.paidDays = Math.max(0, Math.min(r.basisDays, r.basisDays - outside - r.lopDays));
  } else {
    r.basisDays = Math.max(1, workingDaysInMonth);
    // Working-day basis: only working days count; a sandwiched off day costs one day of pay like any other loss of pay.
    r.paidDays = Math.max(0, r.workingDays - (r.lopDays - r.sandwichDays) - r.sandwichDays);
  }
  r.payFactor = r.basisDays > 0 ? Math.min(1, r.paidDays / r.basisDays) : 0;
  r.paidDays = Math.round(r.paidDays * 100) / 100;
  r.lopDays = Math.round(r.lopDays * 100) / 100;
  r.payFactor = Math.round(r.payFactor * 1e6) / 1e6;

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (outside > 0 && input.joinDate && input.joinDate > from) r.notes.push(`Joined on ${input.joinDate}: paid from that date.`);
  if (outside > 0 && input.exitDate && input.exitDate < to) r.notes.push(`Last working day ${input.exitDate}: paid up to that date.`);
  if (r.absentDays > 0) r.notes.push(`${fmt(r.absentDays)} day(s) absent.`);
  if (r.unpaidLeaveDays > 0) r.notes.push(`${fmt(r.unpaidLeaveDays)} day(s) of unpaid leave.`);
  if (r.unmarkedDays > 0) r.notes.push(`${fmt(r.unmarkedDays)} working day(s) with no attendance recorded.`);
  if (r.halfDayLop > 0) r.notes.push(`${fmt(r.halfDayLop)} day(s) lost to half-days.`);
  if (r.lateLop > 0) r.notes.push(`${fmt(r.lateLop)} day(s) for ${lateMarks} late marks.`);
  if (r.overtimeMinutes + r.holidayWorkedMinutes > 0) r.notes.push(`Overtime: ${fmt(Math.round(((r.overtimeMinutes + r.holidayWorkedMinutes) / 60) * 100) / 100)} hour(s).`);
  if (r.sandwichDays > 0) r.notes.push(`${r.sandwichDays} weekly off / holiday day(s) between days of loss of pay are unpaid.`);
  return r;
}

/** Days in a "yyyy-mm" month. */
export function daysInMonth(month: string): number {
  return Number(monthEnd(month).slice(8, 10));
}
