import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { getOrgSettings, classifyDay, todayDateString, isDateString, monthBounds } from "@/lib/products/talentos/settings";
import { holidaySetInRange } from "@/lib/products/talentos/holidays";
import { getPayrollProfile } from "@/lib/products/talentos/payroll";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import { createAdjustment, cancelAdjustment } from "@/lib/products/talentos/payroll-adjustments";
import { startPayout } from "@/lib/products/cashflow-ai/payments/payouts";
import { employeePayee } from "@/lib/products/cashflow-ai/payments/payees";
import { LEAVE_REQUESTS_COLLECTION } from "@/lib/products/talentos/leave";
import { normaliseState } from "@/lib/products/talentos/payroll/rates";
import { notify, notifyEmployee } from "@/lib/products/talentos/notifications";
import {
  EXPENSE_CATEGORIES,
  checkExpense,
  checkOvertime,
  checkShortLeave,
  minutesBetween,
  rangesOverlap,
  type RequestKind,
} from "@/lib/products/talentos/work-request-rules";

/**
 * What an employee asks for (`hrms_work_requests`): overtime they worked, a partial (short) leave, and money they spent on work and want
 * back. A manager or HR approves or rejects each one. Payroll then reads them:
 *   - approved overtime is paid in the month it was worked (at the company's overtime rates), and only approved overtime when the company
 *     has chosen that;
 *   - an approved partial leave is paid, takes nothing from the leave balance, and stops a late mark or a half-day mark on that day costing pay;
 *   - an approved expense becomes a reimbursement item for the month HR picks (not taxable; it repays the employee's own money).
 * Nothing changes once the payroll run for the month has been approved: ask HR to reopen the run first.
 */

// Named here, not imported from payroll-run, because payroll reads this module while it builds a run.
const PAYROLL_RUNS_COLLECTION = "hrms_payroll_runs";
export const WORK_REQUESTS_COLLECTION = "hrms_work_requests";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface WorkRequest extends AuditFields {
  _id: string;
  kind: RequestKind;
  employeeId: string;
  /** Overtime: the day worked. Partial leave: the day. Expense: the bill date. */
  date: string;
  /** The payroll month it affects ("yyyy-mm"). For an expense it is set on approval. */
  month: string;
  reason: string;
  /** Overtime and partial leave. */
  minutes: number;
  /** Overtime: whether the day was a working day or a weekly off / holiday (set on approval). */
  dayType: "working" | "off" | null;
  fromTime: string | null;
  toTime: string | null;
  /** Expense claims. */
  category: string | null;
  title: string | null;
  vendor: string | null;
  billNumber: string | null;
  amount: number;
  approvedAmount: number | null;
  adjustmentId: string | null;
  /** An expense paid straight away through Razorpay instead of with salary: the payment, and when it was paid. */
  payoutId?: string | null;
  paidAt?: Date | null;
  paidUtr?: string | null;
  status: RequestStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
}

let indexEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<WorkRequest>(WORK_REQUESTS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await c.createIndex({ employeeId: 1, kind: 1, month: 1 }).catch(() => {});
    await c.createIndex({ status: 1, kind: 1, createdAt: -1 }).catch(() => {});
  }
  return c;
}

/** A run for this month has been approved or paid: the month's figures are final. */
export async function isMonthFinal(month: string): Promise<boolean> {
  const db = await getDb();
  return (await db.collection(PAYROLL_RUNS_COLLECTION).countDocuments({ month, status: { $in: ["approved", "paid"] } })) > 0;
}

async function limits() {
  const c = await getPayrollConfig();
  return { config: c, limits: { overtimeEnabled: c.overtimeEnabled, overtimeMaxMinutesPerDay: c.overtimeMaxMinutesPerDay, overtimeMaxMinutesPerMonth: c.overtimeMaxMinutesPerMonth, shortLeavesPerMonth: c.shortLeavesPerMonth, shortLeaveMaxMinutes: c.shortLeaveMaxMinutes, expenseMaxAgeDays: c.expenseMaxAgeDays } };
}

/** Is `date` a working day for this employee (their work state's holidays apply)? */
async function dayKind(employeeId: string, date: string) {
  const [settings, profile] = await Promise.all([getOrgSettings(), getPayrollProfile(employeeId)]);
  const state = normaliseState(profile?.statutory?.workState) ?? normaliseState(settings.state);
  const holidays = await holidaySetInRange(date, date, { state });
  return classifyDay(date, settings, holidays);
}

export interface Usage {
  overtimeMinutes: number;
  shortLeaves: number;
}

/** What an employee has used in a month (pending and approved). */
export async function usageFor(employeeId: string, month: string): Promise<Usage> {
  const rows = await (await col()).find({ employeeId, month, status: { $in: ["pending", "approved"] }, kind: { $in: ["overtime", "short_leave"] }, ...notDeleted }).toArray();
  return { overtimeMinutes: rows.filter((r) => r.kind === "overtime").reduce((n, r) => n + r.minutes, 0), shortLeaves: rows.filter((r) => r.kind === "short_leave").length };
}

type Created = { ok: true; request: WorkRequest } | { ok: false; error: string };

async function activeEmployee(employeeId: string) {
  const emp = await getEmployee(employeeId);
  return emp && emp.status === "active" ? emp : null;
}

async function announce(req: WorkRequest, employeeName: string, label: string) {
  await notify({
    audience: "staff",
    type: "request_submitted",
    title: `${employeeName} asked for ${label}`,
    body: req.reason.slice(0, 140),
    link: "/talentos/requests",
    entityType: "work_request",
    entityId: req._id,
  });
}

export async function createOvertime(employeeId: string, input: { date: string; minutes: number; reason: string }, actorId: string): Promise<Created> {
  if (!isDateString(input.date)) return { ok: false, error: "Choose the day you worked overtime." };
  if (!input.reason.trim()) return { ok: false, error: "Say what the extra work was." };
  const emp = await activeEmployee(employeeId);
  if (!emp) return { ok: false, error: "Only an active employee can ask for overtime." };
  const { limits: l } = await limits();
  const month = input.date.slice(0, 7);
  if (await isMonthFinal(month)) return { ok: false, error: "Payroll for that month is already approved. Ask HR." };
  const c = await col();
  const mine = await c.find({ employeeId, kind: "overtime", month, status: { $in: ["pending", "approved"] }, ...notDeleted }).toArray();
  const problem = checkOvertime(
    { minutes: input.minutes, date: input.date, today: todayDateString(), dayUsed: mine.filter((r) => r.date === input.date).reduce((n, r) => n + r.minutes, 0), monthUsed: mine.reduce((n, r) => n + r.minutes, 0) },
    l,
  );
  if (problem) return { ok: false, error: problem };
  const doc: WorkRequest = { ...blank(), _id: newId(), kind: "overtime", employeeId, date: input.date, month, reason: input.reason.trim().slice(0, 300), minutes: input.minutes, ...createStamp(actorId) };
  await c.insertOne(doc);
  await announce(doc, employeeFullName(emp), `${Math.round((input.minutes / 60) * 100) / 100} h overtime`);
  return { ok: true, request: doc };
}

export async function createShortLeave(employeeId: string, input: { date: string; fromTime: string; toTime: string; reason: string }, actorId: string): Promise<Created> {
  if (!isDateString(input.date)) return { ok: false, error: "Choose the day." };
  if (!input.reason.trim()) return { ok: false, error: "Give a reason." };
  const emp = await activeEmployee(employeeId);
  if (!emp) return { ok: false, error: "Only an active employee can ask for leave." };
  const { limits: l } = await limits();
  const month = input.date.slice(0, 7);
  if (await isMonthFinal(month)) return { ok: false, error: "Payroll for that month is already approved. Ask HR." };
  const db = await getDb();
  const c = await col();
  const [kind, mine, leave] = await Promise.all([
    dayKind(employeeId, input.date),
    c.find({ employeeId, kind: "short_leave", month, status: { $in: ["pending", "approved"] }, ...notDeleted }).toArray(),
    db.collection(LEAVE_REQUESTS_COLLECTION).countDocuments({ employeeId, status: { $in: ["pending", "approved"] }, startDate: { $lte: input.date }, endDate: { $gte: input.date }, ...notDeleted }),
  ]);
  const problem = checkShortLeave(
    {
      ...input,
      today: todayDateString(),
      isWorkingDay: kind === "working",
      countThisMonth: mine.length,
      overlapsExisting: mine.some((r) => r.date === input.date && rangesOverlap({ from: r.fromTime!, to: r.toTime! }, { from: input.fromTime, to: input.toTime })),
      coveredByLeave: leave > 0,
    },
    l,
  );
  if (problem) return { ok: false, error: problem };
  const minutes = minutesBetween(input.fromTime, input.toTime)!;
  const doc: WorkRequest = { ...blank(), _id: newId(), kind: "short_leave", employeeId, date: input.date, month, reason: input.reason.trim().slice(0, 300), minutes, fromTime: input.fromTime, toTime: input.toTime, ...createStamp(actorId) };
  await c.insertOne(doc);
  await announce(doc, employeeFullName(emp), `a partial leave on ${input.date}`);
  return { ok: true, request: doc };
}

export async function createExpense(
  employeeId: string,
  input: { category: string; title: string; vendor: string; billNumber: string; billDate: string; amount: number; reason: string },
  actorId: string,
): Promise<Created> {
  if (!isDateString(input.billDate)) return { ok: false, error: "Enter the bill date." };
  const emp = await activeEmployee(employeeId);
  if (!emp) return { ok: false, error: "Only an active employee can file a claim." };
  const { limits: l } = await limits();
  const problem = checkExpense({ ...input, today: todayDateString() }, l);
  if (problem) return { ok: false, error: problem };
  const c = await col();
  const dup = await c.findOne({ employeeId, kind: "expense", vendor: input.vendor.trim(), billNumber: input.billNumber.trim(), amount: input.amount, status: { $in: ["pending", "approved"] }, ...notDeleted });
  if (dup) return { ok: false, error: "You have already filed a claim for this bill." };
  const doc: WorkRequest = {
    ...blank(),
    _id: newId(),
    kind: "expense",
    employeeId,
    date: input.billDate,
    month: "",
    reason: input.reason.trim().slice(0, 300),
    category: input.category,
    title: input.title.trim().slice(0, 120),
    vendor: input.vendor.trim().slice(0, 120),
    billNumber: input.billNumber.trim().slice(0, 60),
    amount: Math.round(input.amount),
    ...createStamp(actorId),
  };
  await c.insertOne(doc);
  await announce(doc, employeeFullName(emp), `₹${doc.amount.toLocaleString("en-IN")} back for ${doc.title}`);
  return { ok: true, request: doc };
}

function blank(): Omit<WorkRequest, "_id" | "kind" | "employeeId" | "date" | "month" | "reason" | keyof AuditFields> {
  return { minutes: 0, dayType: null, fromTime: null, toTime: null, category: null, title: null, vendor: null, billNumber: null, amount: 0, approvedAmount: null, adjustmentId: null, status: "pending", decidedBy: null, decidedAt: null, decisionNote: null };
}

export async function getRequest(id: string): Promise<WorkRequest | null> {
  return (await col()).findOne({ _id: id, ...notDeleted });
}

/** The month an approved expense is paid in when nobody chose: this month, or the next if this month's run is already approved. */
export async function defaultPayMonth(): Promise<string> {
  const now = todayDateString().slice(0, 7);
  if (!(await isMonthFinal(now))) return now;
  const [y, m] = now.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export async function decideRequest(
  id: string,
  decision: "approved" | "rejected",
  note: string | null,
  actorId: string,
  opts: { approvedAmount?: number; payMonth?: string; payNow?: boolean } = {},
): Promise<{ ok: true; request: WorkRequest } | { ok: false; error: string }> {
  const c = await col();
  const req = await c.findOne({ _id: id, ...notDeleted });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: `This request is already ${req.status}.` };
  const patch: Partial<WorkRequest> = { status: decision, decidedBy: actorId, decidedAt: new Date(), decisionNote: note };

  if (decision === "approved") {
    if (req.kind !== "expense" && (await isMonthFinal(req.month))) return { ok: false, error: "Payroll for that month is already approved, so this can no longer be approved." };
    if (req.kind === "overtime") {
      const { limits: l } = await limits();
      const others = await c.find({ employeeId: req.employeeId, kind: "overtime", month: req.month, status: "approved", _id: { $ne: id }, ...notDeleted }).toArray();
      if (others.reduce((n, r) => n + r.minutes, 0) + req.minutes > l.overtimeMaxMinutesPerMonth) return { ok: false, error: "Approving this would take the employee above the monthly overtime limit." };
      patch.dayType = (await dayKind(req.employeeId, req.date)) === "working" ? "working" : "off";
    }
    if (req.kind === "expense") {
      const approvedAmount = Math.round(opts.approvedAmount ?? req.amount);
      if (!(approvedAmount >= 1 && approvedAmount <= req.amount)) return { ok: false, error: "The approved amount must be between ₹1 and the amount claimed." };
      if (opts.payNow) {
        // Paid now through Razorpay, into the employee's primary bank account, instead of with the next salary.
        const payee = await employeePayee(req.employeeId);
        if (!payee.ok) return { ok: false, error: payee.error };
        const started = await startPayout(
          { purpose: "reimbursement", sourceModule: "hrms", sourceRecordId: req._id, payee: payee.payee, amount: approvedAmount, narration: `Claim ${String(req.title).slice(0, 18)}`, employeeId: req.employeeId, description: `Expense claim: ${req.title} (bill ${req.billNumber}, ${req.vendor})` },
          { id: actorId, email: null },
        );
        if (!started.ok) return { ok: false, error: started.error };
        patch.approvedAmount = approvedAmount;
        patch.month = todayDateString().slice(0, 7);
        patch.payoutId = started.payout._id;
      } else {
      const payMonth = opts.payMonth || (await defaultPayMonth());
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payMonth)) return { ok: false, error: "Choose the payroll month it is paid in." };
      if (await isMonthFinal(payMonth)) return { ok: false, error: "The run for that month is already approved. Choose a later month." };
      const adj = await createAdjustment(
        { employeeId: req.employeeId, month: payMonth, category: "reimbursement", name: `Reimbursement: ${req.title}`, amount: approvedAmount, taxable: false, pf: false, esi: false, note: `Bill ${req.billNumber} from ${req.vendor}`, requestId: req._id },
        actorId,
      );
      patch.approvedAmount = approvedAmount;
      patch.month = payMonth;
      patch.adjustmentId = adj._id;
      }
    }
  }
  const res = await c.findOneAndUpdate({ _id: id, status: "pending" }, { $set: { ...patch, ...updateStamp(actorId) } }, { returnDocument: "after" });
  if (!res) return { ok: false, error: "This request was changed by someone else. Reload." };
  await notifyEmployee(req.employeeId, {
    type: "request_decided",
    title: `Your ${label(req.kind)} request was ${decision}`,
    body: note ? note.slice(0, 140) : req.kind === "expense" && decision === "approved" ? (res.payoutId ? `₹${res.approvedAmount?.toLocaleString("en-IN")} has been sent to your bank account.` : `₹${res.approvedAmount?.toLocaleString("en-IN")} will be paid with ${res.month} salary.`) : "",
    link: "/talentos/me/requests",
    entityType: "work_request",
    entityId: id,
  });
  return { ok: true, request: res };
}

const label = (k: RequestKind) => (k === "overtime" ? "overtime" : k === "short_leave" ? "partial leave" : "expense");

/** Withdraw a request. A pending one can always be withdrawn; an approved one only while its payroll month is still open. */
export async function cancelRequest(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await col();
  const req = await c.findOne({ _id: id, ...notDeleted });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status === "pending") {
    await c.updateOne({ _id: id, status: "pending" }, { $set: { status: "cancelled", ...updateStamp(actorId) } });
    return { ok: true };
  }
  if (req.status !== "approved") return { ok: false, error: `A ${req.status} request cannot be withdrawn.` };
  if (req.kind === "expense") {
    if (req.payoutId) return { ok: false, error: "This claim has already been sent for payment through Razorpay." };
    if (req.adjustmentId) {
      const r = await cancelAdjustment(req.adjustmentId, actorId);
      if (!r.ok) return { ok: false, error: "A payroll run has already paid this claim." };
    }
  } else if (await isMonthFinal(req.month)) {
    return { ok: false, error: "Payroll for that month is already approved. Ask HR." };
  }
  await c.updateOne({ _id: id }, { $set: { status: "cancelled", ...updateStamp(actorId) } });
  return { ok: true };
}

export interface RequestFilter {
  kind?: RequestKind;
  status?: RequestStatus;
  employeeIds?: string[];
  employeeId?: string;
  month?: string;
}

export async function listRequests(f: RequestFilter = {}, limit = 200): Promise<WorkRequest[]> {
  const q: Record<string, unknown> = { ...notDeleted };
  if (f.kind) q.kind = f.kind;
  if (f.status) q.status = f.status;
  if (f.employeeId) q.employeeId = f.employeeId;
  else if (f.employeeIds) q.employeeId = { $in: f.employeeIds };
  if (f.month) q.month = f.month;
  return (await col()).find(q).sort({ createdAt: -1 }).limit(limit).toArray();
}

/** Approved overtime of the month, per employee (minutes on working days, minutes on weekly offs and holidays). */
export async function approvedOvertime(month: string, employeeIds: string[]): Promise<Map<string, { regularMinutes: number; holidayMinutes: number }>> {
  const out = new Map<string, { regularMinutes: number; holidayMinutes: number }>();
  if (employeeIds.length === 0) return out;
  const rows = await (await col()).find({ kind: "overtime", status: "approved", month, employeeId: { $in: employeeIds }, ...notDeleted }).toArray();
  for (const r of rows) {
    const cur = out.get(r.employeeId) ?? { regularMinutes: 0, holidayMinutes: 0 };
    if (r.dayType === "off") cur.holidayMinutes += r.minutes;
    else cur.regularMinutes += r.minutes;
    out.set(r.employeeId, cur);
  }
  return out;
}

/** Dates of approved partial leaves in a window, per employee. */
export async function approvedShortLeaveDates(from: string, to: string, employeeIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (employeeIds.length === 0) return out;
  const rows = await (await col()).find({ kind: "short_leave", status: "approved", date: { $gte: from, $lte: to }, employeeId: { $in: employeeIds }, ...notDeleted }, { projection: { employeeId: 1, date: 1 } }).toArray();
  for (const r of rows) {
    const set = out.get(r.employeeId) ?? new Set<string>();
    set.add(r.date);
    out.set(r.employeeId, set);
  }
  return out;
}

/** Requests still waiting that would change this month's pay (listed as a review point on the run). */
export async function pendingForPayroll(month: string): Promise<{ overtime: number; expenses: number }> {
  const { from, to } = monthBounds(month);
  const c = await col();
  const [overtime, expenses] = await Promise.all([
    c.countDocuments({ kind: "overtime", status: "pending", month, ...notDeleted }),
    c.countDocuments({ kind: "expense", status: "pending", date: { $lte: to }, ...notDeleted }),
  ]);
  void from;
  return { overtime, expenses };
}

export { EXPENSE_CATEGORIES };
