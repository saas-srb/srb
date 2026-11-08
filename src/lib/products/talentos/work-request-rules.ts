/**
 * The rules for what an employee may ask for: overtime, a partial (short) leave, and money spent on work that is claimed back. Pure, so the
 * same checks run in the portal form, on the server and in tests.
 */

export type RequestKind = "overtime" | "short_leave" | "expense";

export const EXPENSE_CATEGORIES = [
  { value: "asset", label: "Equipment or asset bought for work" },
  { value: "subscription", label: "Software or subscription" },
  { value: "internet_phone", label: "Internet or phone for work" },
  { value: "travel", label: "Travel and local conveyance" },
  { value: "client", label: "Client meeting, meals or gifts" },
  { value: "training", label: "Training, books or certification" },
  { value: "other", label: "Other work expense" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export interface RequestLimits {
  overtimeEnabled: boolean;
  overtimeMaxMinutesPerDay: number;
  overtimeMaxMinutesPerMonth: number;
  shortLeavesPerMonth: number;
  shortLeaveMaxMinutes: number;
  expenseMaxAgeDays: number;
}

const toMinutes = (t: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Minutes between two "HH:mm" times on the same day; `null` when either is not a time or the end is not after the start. */
export function minutesBetween(from: string, to: string): number | null {
  const a = toMinutes(from);
  const b = toMinutes(to);
  return a === null || b === null || b <= a ? null : b - a;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Overtime: `dayUsed` and `monthUsed` are minutes already requested (pending or approved) for that date and month. */
export function checkOvertime(i: { minutes: number; date: string; today: string; dayUsed: number; monthUsed: number }, l: RequestLimits): string | null {
  if (!l.overtimeEnabled) return "Your company does not pay overtime.";
  if (!Number.isInteger(i.minutes) || i.minutes < 15) return "Enter at least 15 minutes.";
  if (i.date > i.today) return "Overtime can be requested only after the work is done.";
  if (daysBetween(i.date, i.today) > 45) return "Overtime older than 45 days cannot be requested.";
  if (i.dayUsed + i.minutes > l.overtimeMaxMinutesPerDay) return `At most ${l.overtimeMaxMinutesPerDay / 60} hour(s) of overtime can be claimed for a day${i.dayUsed ? ` (you have already asked for ${i.dayUsed} minutes on this date)` : ""}.`;
  if (i.monthUsed + i.minutes > l.overtimeMaxMinutesPerMonth) return `That would take your overtime for the month above the limit of ${l.overtimeMaxMinutesPerMonth / 60} hours.`;
  return null;
}

/** Partial leave: `countThisMonth` is how many are already pending or approved in that month. */
export function checkShortLeave(i: { date: string; fromTime: string; toTime: string; today: string; isWorkingDay: boolean; countThisMonth: number; overlapsExisting: boolean; coveredByLeave: boolean }, l: RequestLimits): string | null {
  if (l.shortLeavesPerMonth <= 0) return "Your company does not offer partial leave.";
  const minutes = minutesBetween(i.fromTime, i.toTime);
  if (minutes === null) return "Enter a start time and a later end time.";
  if (minutes < 15) return "A partial leave is at least 15 minutes.";
  if (minutes > l.shortLeaveMaxMinutes) return `A partial leave can be at most ${l.shortLeaveMaxMinutes / 60} hour(s). Apply for a half-day or a full-day leave instead.`;
  if (!i.isWorkingDay) return "That day is a weekly off or a holiday.";
  if (i.coveredByLeave) return "You already have a leave on that day.";
  if (i.overlapsExisting) return "You already have a partial leave at that time.";
  if (daysBetween(i.today, i.date) > 60) return "Partial leave can be requested up to 60 days ahead.";
  if (daysBetween(i.date, i.today) > 31) return "A partial leave older than 31 days cannot be requested.";
  if (i.countThisMonth >= l.shortLeavesPerMonth) return `You have used your ${l.shortLeavesPerMonth} partial leave(s) for this month.`;
  return null;
}

/** An expense claim. */
export function checkExpense(i: { amount: number; billDate: string; today: string; category: string; title: string; vendor: string; billNumber: string }, l: RequestLimits): string | null {
  if (!EXPENSE_CATEGORIES.some((c) => c.value === i.category)) return "Choose what the money was spent on.";
  if (!i.title.trim()) return "Say what you bought.";
  if (!i.vendor.trim()) return "Enter who you paid (the shop, seller or service).";
  if (!i.billNumber.trim()) return "Enter the bill or invoice number. Claims are paid against a bill.";
  if (!Number.isFinite(i.amount) || i.amount < 1 || i.amount > 10_000_000) return "Enter the amount on the bill.";
  if (i.billDate > i.today) return "The bill date cannot be in the future.";
  if (daysBetween(i.billDate, i.today) > l.expenseMaxAgeDays) return `Claims must be filed within ${l.expenseMaxAgeDays} days of the bill.`;
  return null;
}

/** Two time ranges on one day overlap. */
export function rangesOverlap(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return a.from < b.to && b.from < a.to;
}
