import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import { getPayrollProfile, upsertPayrollProfile, type PayComponent } from "@/lib/products/talentos/payroll";

/**
 * Effective-dated salary structure changes. A payroll run for month M uses the
 * latest revision whose `effectiveFrom` is on or before the last day of M;
 * when there is none it falls back to the `hrms_payroll_profiles` baseline.
 * Creating a revision also snapshots it into the payroll profile so the current
 * structure everywhere else stays in sync.
 */

export const SALARY_REVISIONS_COLLECTION = "hrms_salary_revisions";

export interface SalaryStructure {
  basic: number;
  /** Dearness allowance. */
  da?: number;
  hra: number;
  allowances: PayComponent[];
  deductions: PayComponent[];
  /** The employer's NPS contribution per month. */
  employerNps?: number;
}

export interface SalaryRevision extends AuditFields, SalaryStructure {
  _id: string;
  employeeId: string;
  effectiveFrom: string; // "yyyy-mm-dd"
  reason: string | null;
}

export interface SerializedSalaryRevision extends Omit<SalaryRevision, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

let indexEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<SalaryRevision>(SALARY_REVISIONS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await collection.createIndex({ employeeId: 1, effectiveFrom: -1 }).catch(() => {});
  }
  return collection;
}

export function serializeRevision(r: SalaryRevision): SerializedSalaryRevision {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

export async function listRevisions(employeeId: string): Promise<SalaryRevision[]> {
  const collection = await getCollection();
  return collection.find({ employeeId, ...notDeleted }).sort({ effectiveFrom: -1 }).toArray();
}

export async function createRevision(
  input: SalaryStructure & { employeeId: string; effectiveFrom: string; reason: string | null },
  actorId: string
): Promise<SalaryRevision> {
  const collection = await getCollection();
  const doc: SalaryRevision = {
    _id: newId(),
    employeeId: input.employeeId,
    effectiveFrom: input.effectiveFrom,
    reason: input.reason,
    basic: input.basic,
    da: input.da ?? 0,
    hra: input.hra,
    allowances: input.allowances,
    deductions: input.deductions,
    employerNps: input.employerNps ?? 0,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);

  // Keep the payroll profile's current structure aligned with the most recent revision.
  const latest = await collection.find({ employeeId: input.employeeId, ...notDeleted }).sort({ effectiveFrom: -1 }).limit(1).toArray();
  if (latest[0]?._id === doc._id) {
    const existing = await getPayrollProfile(input.employeeId);
    await upsertPayrollProfile(
      input.employeeId,
      {
        currency: "INR",
        basic: input.basic,
        da: input.da ?? 0,
        hra: input.hra,
        allowances: input.allowances,
        deductions: input.deductions,
        employerNps: input.employerNps ?? 0,
        pfNumber: existing?.pfNumber ?? null,
        esiNumber: existing?.esiNumber ?? null,
        uan: existing?.uan ?? null,
        panNumber: existing?.panNumber ?? null,
        bank: existing?.bank ?? { accountName: null, accountNumber: null, ifsc: null, bankName: null, branch: null },
      },
      actorId
    );
  }
  return doc;
}

/** Structure in effect on `onDate` — a revision if one applies, else the profile baseline. */
export async function effectiveStructure(employeeId: string, onDate: string): Promise<SalaryStructure | null> {
  const collection = await getCollection();
  const rev = await collection
    .find({ employeeId, effectiveFrom: { $lte: onDate }, ...notDeleted })
    .sort({ effectiveFrom: -1 })
    .limit(1)
    .toArray();
  if (rev[0]) {
    return { basic: rev[0].basic, da: rev[0].da ?? 0, hra: rev[0].hra, allowances: rev[0].allowances, deductions: rev[0].deductions, employerNps: rev[0].employerNps ?? 0 };
  }
  const profile = await getPayrollProfile(employeeId);
  if (!profile) return null;
  return { basic: profile.basic, da: profile.da, hra: profile.hra, allowances: profile.allowances, deductions: profile.deductions, employerNps: profile.employerNps };
}

export function structureGross(s: SalaryStructure): number {
  return s.basic + (s.da ?? 0) + s.hra + s.allowances.reduce((sum, a) => sum + a.amount, 0);
}
