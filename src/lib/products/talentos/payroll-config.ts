import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/talentos/db";

/**
 * A company's payroll policy (single document): how it pays, not what the law sets. The law's own figures (PF, ESI, tax slabs, professional
 * tax) are published by the platform and are the same for every company (see `payroll/rates-store.ts`); a company cannot change them.
 * Edited in Settings → Payroll.
 */

export const PAYROLL_CONFIG_COLLECTION = "hrms_payroll_config";
const PAYROLL_CONFIG_ID = "org";

export interface PayrollConfig {
  _id: string;

  // Which registrations the company holds. A company that is not registered with EPFO / ESIC deducts nothing for them.
  pfRegistered: boolean;
  esiRegistered: boolean;
  ptRegistered: boolean;
  lwfRegistered: boolean;

  // How days are counted
  /** Pay for a day = the month's pay over: the calendar days of the month, its working days, or a fixed number of days. */
  paidDaysBasis: "calendar" | "working" | "fixed";
  fixedDays: number;
  /** Weekly offs / holidays between two days of loss of pay: paid ("none"), unpaid after unpaid leave, or unpaid after any loss of pay. */
  sandwichRule: "none" | "unpaid_leave" | "all_lop";
  /** A working day with no attendance recorded: "lop" (not paid) or "present" (paid). */
  unmarkedDay: "lop" | "present";
  /** Every N late marks cost half a day (0 = never). */
  lateMarksPerHalfDay: number;
  overtimeEnabled: boolean;
  /** Overtime is paid only for hours the employee requested and a manager approved (attendance alone does not earn it). */
  overtimeRequiresApproval: boolean;
  /** The most overtime one request may claim for a day, and all requests together in a month (minutes). */
  overtimeMaxMinutesPerDay: number;
  overtimeMaxMinutesPerMonth: number;
  overtimeMultiplier: number;
  holidayWorkMultiplier: number;
  hoursPerDay: number;
  /** Partial (short) leaves an employee may take in a month, and the longest one (minutes). They are paid and use no leave balance. */
  shortLeavesPerMonth: number;
  shortLeaveMaxMinutes: number;
  /** A claim for money the employee spent must be filed within this many days of the bill. */
  expenseMaxAgeDays: number;

  // Statutory policy
  /** "flags": PF wages = the components marked PF. "fifty_percent_rule": at least half of total pay (Code on Wages, 2019). */
  wageDefinition: "flags" | "fifty_percent_rule";
  /** New employees contribute to PF on wages up to the ceiling, or on all wages. */
  pfDefaultMode: "ceiling" | "actual";
  statutoryBonusEnabled: boolean;
  statutoryBonusPercent: number;
  /** The state's minimum wage used as the floor of the bonus calculation wage (0 = none). */
  minimumWage: number;
  /** The Payment of Gratuity Act covers the establishment (ten or more employees). */
  gratuityCovered: boolean;
  includeGratuityProvision: boolean;
  /** Days in a month for a day's leave encashment: 30 or 26. */
  leaveEncashmentDaysInMonth: number;

  // Tax
  tdsEnabled: boolean;
  /** Regime used for an employee who has not chosen one. */
  defaultTaxRegime: "new" | "old";
  /** With no PAN: warn only, or deduct at not less than 20%. */
  noPanRule: "warn" | "apply_20_percent";
  /** From this calendar month (1 to 12) of the financial year's last quarter, investment declarations count only when proof has been verified. */
  proofCutoffMonth: number;

  // Controls
  /** Loan instalments and other recoveries may not take total deductions above this share of wages. */
  deductionCapPercent: number;
  /** A payroll run must be approved by someone other than the person who created it. */
  requireSeparateApprover: boolean;
  /** The company current account salaries are paid from by default (a CashFlow bank account). Set on the Payroll → Bank account page. */
  salaryAccountId: string | null;
  financialYearStartMonth: number;

  updatedAt: Date;
  updatedBy: string | null;
}

export type PayrollConfigInput = Omit<PayrollConfig, "_id" | "updatedAt" | "updatedBy" | "salaryAccountId">;

export const PAYROLL_DEFAULTS: PayrollConfigInput & { salaryAccountId: string | null } = {
  pfRegistered: true,
  esiRegistered: true,
  ptRegistered: true,
  lwfRegistered: false,
  paidDaysBasis: "calendar",
  fixedDays: 30,
  sandwichRule: "none",
  unmarkedDay: "lop",
  lateMarksPerHalfDay: 0,
  overtimeEnabled: false,
  overtimeRequiresApproval: true,
  overtimeMaxMinutesPerDay: 240,
  overtimeMaxMinutesPerMonth: 3000,
  overtimeMultiplier: 2,
  holidayWorkMultiplier: 2,
  hoursPerDay: 8,
  shortLeavesPerMonth: 2,
  shortLeaveMaxMinutes: 240,
  expenseMaxAgeDays: 60,
  wageDefinition: "flags",
  pfDefaultMode: "ceiling",
  statutoryBonusEnabled: false,
  statutoryBonusPercent: 8.33,
  minimumWage: 0,
  gratuityCovered: true,
  includeGratuityProvision: true,
  leaveEncashmentDaysInMonth: 30,
  tdsEnabled: true,
  defaultTaxRegime: "new",
  noPanRule: "warn",
  proofCutoffMonth: 1,
  deductionCapPercent: 50,
  requireSeparateApprover: false,
  salaryAccountId: null,
  financialYearStartMonth: 4,
};

export async function getPayrollConfig(): Promise<PayrollConfig> {
  const db = await getDb();
  const collection = db.collection<PayrollConfig>(PAYROLL_CONFIG_COLLECTION);
  const existing = await collection.findOne({ _id: PAYROLL_CONFIG_ID });
  if (existing) return { ...PAYROLL_DEFAULTS, ...existing };
  const doc: PayrollConfig = { _id: PAYROLL_CONFIG_ID, ...PAYROLL_DEFAULTS, updatedAt: new Date(), updatedBy: null };
  await collection.updateOne({ _id: PAYROLL_CONFIG_ID }, { $setOnInsert: doc }, { upsert: true });
  return doc;
}

export async function updatePayrollConfig(data: PayrollConfigInput, actorId: string): Promise<PayrollConfig> {
  const db = await getDb();
  const collection = db.collection<PayrollConfig>(PAYROLL_CONFIG_COLLECTION);
  const result = await collection.findOneAndUpdate(
    { _id: PAYROLL_CONFIG_ID },
    { $set: { ...data, financialYearStartMonth: 4, ...updateStamp(actorId) } },
    { upsert: true, returnDocument: "after" },
  );
  return { ...PAYROLL_DEFAULTS, ...(result as PayrollConfig) };
}

/** Months remaining in the financial year that contains `month` ("yyyy-mm"), inclusive. */
export function monthsRemainingInFY(month: string, fyStartMonth: number): number {
  const m = Number(month.slice(5, 7));
  const idx = (m - fyStartMonth + 12) % 12;
  return 12 - idx;
}

/** The "yyyy-mm" of the first month of the FY containing `month`. */
export function fyStartMonthString(month: string, fyStartMonth: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const startYear = m >= fyStartMonth ? y : y - 1;
  return `${startYear}-${String(fyStartMonth).padStart(2, "0")}`;
}

/** Which company current account salaries are paid from by default. */
export async function setSalaryAccount(accountId: string | null, actorId: string): Promise<void> {
  const db = await getDb();
  await db.collection<PayrollConfig>(PAYROLL_CONFIG_COLLECTION).updateOne({ _id: PAYROLL_CONFIG_ID }, { $set: { salaryAccountId: accountId, ...updateStamp(actorId) } }, { upsert: true });
}
