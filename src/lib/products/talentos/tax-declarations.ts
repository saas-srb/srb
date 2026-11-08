import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/products/talentos/db";
import { NO_DEDUCTIONS, type DeductionAmounts, type Regime } from "@/lib/products/talentos/payroll/tax";

/**
 * An employee's income-tax declaration for a financial year (`hrms_tax_declarations`, one per employee and year): the regime they choose, the
 * investments and expenses they expect to claim, rent, other income, and what a previous employer in the same year already paid and deducted.
 *
 * It works the way the law makes employers work: the employee declares at the start of the year (and may change it), payroll deducts tax
 * on the declared figures, and near the end of the year only what the employee has proved counts. HR checks the proofs and records what it
 * accepts as `verified`.
 */

export const TAX_DECLARATIONS_COLLECTION = "hrms_tax_declarations";

export type DeclarationStatus = "draft" | "submitted" | "verified";

export interface PreviousEmployer {
  employerName: string;
  /** Salary taxable after the exemptions that employer allowed (Form 12B / Form 16 of the previous employer). */
  taxableSalary: number;
  employeePf: number;
  professionalTax: number;
  tds: number;
}

export interface TaxDeclaration extends AuditFields {
  _id: string;
  employeeId: string;
  /** "2026-27". */
  fy: string;
  regime: Regime;
  declared: DeductionAmounts;
  /** What HR accepted after seeing the proofs. Empty until HR verifies. */
  verified: DeductionAmounts;
  previousEmployer: PreviousEmployer;
  landlordPan: string | null;
  status: DeclarationStatus;
  submittedAt: Date | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  hrNote: string | null;
}

export const NO_PREVIOUS_EMPLOYER: PreviousEmployer = { employerName: "", taxableSalary: 0, employeePf: 0, professionalTax: 0, tds: 0 };

let indexEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<TaxDeclaration>(TAX_DECLARATIONS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await c.createIndex({ employeeId: 1, fy: 1 }, { unique: true }).catch(() => {});
    await c.createIndex({ fy: 1, status: 1 }).catch(() => {});
  }
  return c;
}

export async function getDeclaration(employeeId: string, fy: string): Promise<TaxDeclaration | null> {
  return (await col()).findOne({ employeeId, fy });
}

export async function listDeclarations(fy: string, status?: DeclarationStatus): Promise<TaxDeclaration[]> {
  return (await col()).find({ fy, ...(status ? { status } : {}) }).sort({ updatedAt: -1 }).toArray();
}

export async function declarationsForEmployees(employeeIds: string[], fy: string): Promise<Map<string, TaxDeclaration>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await (await col()).find({ employeeId: { $in: employeeIds }, fy }).toArray();
  return new Map(rows.map((d) => [d.employeeId, d]));
}

export interface DeclarationInput {
  regime: Regime;
  declared: DeductionAmounts;
  previousEmployer: PreviousEmployer;
  landlordPan: string | null;
  submit: boolean;
}

/** An employee saves (or submits) their own declaration. Once HR has verified it, it is locked until HR reopens it. */
export async function saveDeclaration(employeeId: string, fy: string, input: DeclarationInput, actorId: string): Promise<{ ok: true; declaration: TaxDeclaration } | { ok: false; error: string }> {
  const c = await col();
  const existing = await c.findOne({ employeeId, fy });
  if (existing?.status === "verified") return { ok: false, error: "HR has already verified this declaration. Ask HR to reopen it to change it." };
  const now = new Date();
  const status: DeclarationStatus = input.submit ? "submitted" : "draft";
  if (existing) {
    const res = await c.findOneAndUpdate(
      { _id: existing._id },
      { $set: { regime: input.regime, declared: input.declared, previousEmployer: input.previousEmployer, landlordPan: input.landlordPan, status, submittedAt: input.submit ? now : existing.submittedAt, ...updateStamp(actorId) } },
      { returnDocument: "after" },
    );
    return { ok: true, declaration: res! };
  }
  const doc: TaxDeclaration = {
    _id: newId(),
    employeeId,
    fy,
    regime: input.regime,
    declared: input.declared,
    verified: NO_DEDUCTIONS,
    previousEmployer: input.previousEmployer,
    landlordPan: input.landlordPan,
    status,
    submittedAt: input.submit ? now : null,
    verifiedAt: null,
    verifiedBy: null,
    hrNote: null,
    ...createStamp(actorId),
  };
  await c.insertOne(doc);
  return { ok: true, declaration: doc };
}

/** HR records what it accepts (`verified`), or reopens the declaration for changes. */
export async function verifyDeclaration(id: string, verified: DeductionAmounts, note: string | null, actorId: string): Promise<boolean> {
  const res = await (await col()).updateOne({ _id: id }, { $set: { verified, status: "verified" as const, verifiedAt: new Date(), verifiedBy: actorId, hrNote: note, ...updateStamp(actorId) } });
  return res.matchedCount === 1;
}

export async function reopenDeclaration(id: string, note: string | null, actorId: string): Promise<boolean> {
  const res = await (await col()).updateOne({ _id: id }, { $set: { status: "submitted" as const, hrNote: note, ...updateStamp(actorId) } });
  return res.matchedCount === 1;
}

/**
 * The amounts payroll uses for a month. Until the proof cut-off every declared amount counts; from the cut-off month of the year's last
 * quarter (January by default) only what HR verified counts, so unproved claims stop reducing the tax in time for the year-end true-up.
 */
export function effectiveAmounts(d: TaxDeclaration | null, month: string, proofCutoffMonth: number): DeductionAmounts {
  if (!d) return NO_DEDUCTIONS;
  const m = Number(month.slice(5, 7));
  const afterCutoff = m >= 1 && m <= 3 && m >= proofCutoffMonth;
  if (afterCutoff && d.status === "verified") return { ...d.verified, rentPaidAnnual: d.verified.rentPaidAnnual, rentInMetro: d.declared.rentInMetro };
  if (afterCutoff) return NO_DEDUCTIONS;
  return d.declared;
}

// ── Reading what a person typed ─────────────────────────────────────────────────────────────────────────────────────────────

const amount = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(Math.min(n, 1e9)) : 0;
};
const flag = (v: unknown) => v === true || v === "true" || v === "on";
const level = (v: unknown): "none" | "normal" | "severe" => (v === "normal" || v === "severe" ? v : "none");

export function parseDeductions(input: Record<string, unknown> | undefined): DeductionAmounts {
  const i = input ?? {};
  return {
    section80C: amount(i.section80C),
    section80CCD1B: amount(i.section80CCD1B),
    section80DSelf: amount(i.section80DSelf),
    section80DSelfSenior: flag(i.section80DSelfSenior),
    section80DParents: amount(i.section80DParents),
    section80DParentsSenior: flag(i.section80DParentsSenior),
    section80DPreventive: amount(i.section80DPreventive),
    section80E: amount(i.section80E),
    section80G: amount(i.section80G),
    interestSavings: amount(i.interestSavings),
    disability80DD: level(i.disability80DD),
    disability80U: level(i.disability80U),
    section80DDB: amount(i.section80DDB),
    section80DDBSenior: flag(i.section80DDBSenior),
    homeLoanInterest: amount(i.homeLoanInterest),
    ltaExemption: amount(i.ltaExemption),
    otherIncome: (() => {
      const n = typeof i.otherIncome === "number" ? i.otherIncome : Number(String(i.otherIncome ?? "").replace(/[, ]/g, ""));
      return Number.isFinite(n) ? Math.round(Math.max(-1e9, Math.min(n, 1e9))) : 0;
    })(),
    rentPaidAnnual: amount(i.rentPaidAnnual),
    rentInMetro: flag(i.rentInMetro),
  };
}

export function validateDeclaration(input: Record<string, unknown>): { valid: true; data: DeclarationInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const regime = input.regime === "old" ? "old" : input.regime === "new" ? "new" : null;
  if (!regime) errors.regime = "Choose the tax regime.";
  const prev = (input.previousEmployer ?? {}) as Record<string, unknown>;
  const previousEmployer: PreviousEmployer = {
    employerName: String(prev.employerName ?? "").trim().slice(0, 120),
    taxableSalary: amount(prev.taxableSalary),
    employeePf: amount(prev.employeePf),
    professionalTax: amount(prev.professionalTax),
    tds: amount(prev.tds),
  };
  if (previousEmployer.tds > previousEmployer.taxableSalary && previousEmployer.taxableSalary > 0) errors.previousEmployer = "The tax deducted cannot be more than the salary.";
  const declared = parseDeductions(input.declared as Record<string, unknown>);
  const landlordRaw = String(input.landlordPan ?? "").toUpperCase().replace(/\s/g, "");
  if (landlordRaw && !/^[A-Z]{5}\d{4}[A-Z]$/.test(landlordRaw)) errors.landlordPan = "PAN is five letters, four digits, one letter.";
  if (declared.rentPaidAnnual > 100000 && !landlordRaw) errors.landlordPan = "Rent above ₹1,00,000 a year needs the landlord's PAN.";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { regime: regime!, declared, previousEmployer, landlordPan: landlordRaw || null, submit: input.submit === true || input.submit === "true" } };
}
