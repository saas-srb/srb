import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import type { StatutoryFlags } from "@/lib/products/talentos/payroll/statutory";
import { DEFAULT_STATUTORY } from "@/lib/products/talentos/payroll/statutory";
export { DEFAULT_STATUTORY };
export type { StatutoryFlags } from "@/lib/products/talentos/payroll/statutory";

/**
 * Payroll-ready employee records (Phase 1 — structure only, no run/payslip
 * generation yet). One document per employee.
 */

export const PAYROLL_PROFILES_COLLECTION = "hrms_payroll_profiles";

export interface PayComponent {
  name: string;
  amount: number; // monthly, INR
  /** Taxable salary (default true). */
  taxable?: boolean;
  /** Counted in PF wages (default false). */
  pf?: boolean;
  /** Counted in ESI wages (default true). */
  esi?: boolean;
  /** Paid in proportion to the days paid (default true). */
  prorate?: boolean;
}

/** Which statutory deductions apply to one employee, and how. */

export interface BankDetails {
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  branch: string | null;
}

export interface PayrollProfile extends AuditFields {
  _id: string;
  employeeId: string;
  currency: string;
  basic: number;
  /** Dearness allowance. */
  da: number;
  hra: number;
  allowances: PayComponent[];
  deductions: PayComponent[];
  /** The employer's NPS contribution per month. */
  employerNps: number;
  pfNumber: string | null;
  esiNumber: string | null;
  uan: string | null;
  panNumber: string | null;
  statutory: StatutoryFlags;
  bank: BankDetails;
}

export interface SerializedPayrollProfile extends Omit<PayrollProfile, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<PayrollProfile>(PAYROLL_PROFILES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ employeeId: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

export function emptyBank(): BankDetails {
  return { accountName: null, accountNumber: null, ifsc: null, bankName: null, branch: null };
}

/** Gross monthly earnings = basic + DA + hra + all allowances. */
export function computeGrossMonthly(p: Pick<PayrollProfile, "basic" | "hra" | "allowances"> & { da?: number }): number {
  return p.basic + (p.da ?? 0) + p.hra + p.allowances.reduce((sum, a) => sum + a.amount, 0);
}

export function computeTotalDeductions(p: Pick<PayrollProfile, "deductions">): number {
  return p.deductions.reduce((sum, d) => sum + d.amount, 0);
}

export function computeNetMonthly(p: Pick<PayrollProfile, "basic" | "hra" | "allowances" | "deductions"> & { da?: number }): number {
  return computeGrossMonthly(p) - computeTotalDeductions(p);
}

/** Annual cost to company = gross monthly * 12 (employer deductions excluded in Phase 1). */
export function computeAnnualCtc(p: Pick<PayrollProfile, "basic" | "hra" | "allowances"> & { da?: number }): number {
  return computeGrossMonthly(p) * 12;
}

export function serializePayrollProfile(p: PayrollProfile): SerializedPayrollProfile {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}

/** A profile saved before DA, employer NPS and the statutory flags existed gets their defaults. */
function withDefaults(p: PayrollProfile): PayrollProfile {
  return { ...p, da: p.da ?? 0, employerNps: p.employerNps ?? 0, statutory: { ...DEFAULT_STATUTORY, ...(p.statutory ?? {}) } };
}

export async function getPayrollProfile(employeeId: string): Promise<PayrollProfile | null> {
  const collection = await getCollection();
  const p = await collection.findOne({ employeeId, ...notDeleted });
  return p ? withDefaults(p) : null;
}

export interface PayrollWriteData {
  currency: string;
  basic: number;
  da?: number;
  hra: number;
  allowances: PayComponent[];
  deductions: PayComponent[];
  employerNps?: number;
  pfNumber: string | null;
  esiNumber: string | null;
  uan: string | null;
  panNumber: string | null;
  statutory?: StatutoryFlags;
  /** Legacy — bank details now live in `hrms_bank_accounts`. Ignored on write. */
  bank?: BankDetails;
}

/** Creates or replaces the payroll profile for an employee. Bank details are
 *  managed separately in `hrms_bank_accounts` and never touched here. */
export async function upsertPayrollProfile(
  employeeId: string,
  data: PayrollWriteData,
  actorId: string
): Promise<PayrollProfile> {
  const collection = await getCollection();
  const existing = await collection.findOne({ employeeId });
  const { bank: _ignored, ...given } = data;
  void _ignored;
  // Only what was given is written, so a caller that knows nothing of DA, employer NPS or the flags (a salary revision) leaves them as they were.
  const persist = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined)) as Omit<PayrollWriteData, "bank">;

  if (existing) {
    const updated = await collection.findOneAndUpdate(
      { _id: existing._id },
      { $set: { ...persist, deletedAt: null, ...updateStamp(actorId) } },
      { returnDocument: "after" }
    );
    return updated!;
  }

  const doc: PayrollProfile = {
    _id: newId(),
    employeeId,
    ...persist,
    da: persist.da ?? 0,
    employerNps: persist.employerNps ?? 0,
    statutory: { ...DEFAULT_STATUTORY, ...(persist.statutory ?? {}) },
    bank: emptyBank(),
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function deletePayrollProfile(employeeId: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { employeeId, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}
