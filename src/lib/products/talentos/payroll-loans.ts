import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/products/talentos/db";
import type { LoanInstalment } from "@/lib/products/talentos/payroll/compute";

/**
 * Salary advances and loans given to employees (`hrms_payroll_loans`), recovered by instalments through payroll. A run in draft only
 * *shows* the instalments due; approving the run books them against the balance, and deleting an approved run takes them back, so the
 * balance always equals what the payslips really recovered. An instalment the legal limit on deductions could not take simply stays
 * in the balance and falls due again the next month.
 */

export const LOANS_COLLECTION = "hrms_payroll_loans";

export interface LoanPayment {
  month: string;
  runId: string;
  amount: number;
  at: Date;
}

export interface Loan extends AuditFields {
  _id: string;
  employeeId: string;
  name: string;
  principal: number;
  /** Instalment per month. */
  emi: number;
  /** First month it is recovered ("yyyy-mm"). */
  startMonth: number | string;
  balance: number;
  status: "active" | "closed" | "cancelled";
  note: string | null;
  payments: LoanPayment[];
}

let indexEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<Loan>(LOANS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await c.createIndex({ employeeId: 1, status: 1 }).catch(() => {});
  }
  return c;
}

export async function listLoans(opts: { employeeId?: string; status?: Loan["status"] } = {}): Promise<Loan[]> {
  return (await col()).find({ deletedAt: null, ...(opts.employeeId ? { employeeId: opts.employeeId } : {}), ...(opts.status ? { status: opts.status } : {}) }).sort({ createdAt: -1 }).toArray();
}

export async function getLoan(id: string): Promise<Loan | null> {
  return (await col()).findOne({ _id: id, deletedAt: null });
}

export interface LoanInput {
  employeeId: string;
  name: string;
  principal: number;
  emi: number;
  startMonth: string;
  note: string | null;
}

export function validateLoan(input: Record<string, unknown>): { valid: true; data: LoanInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const employeeId = String(input.employeeId ?? "").trim();
  if (!employeeId) errors.employeeId = "Choose the employee.";
  const name = String(input.name ?? "").trim().slice(0, 80) || "Salary advance";
  const principal = Math.round(Number(String(input.principal ?? "").replace(/[, ]/g, "")));
  if (!(principal > 0 && principal <= 1e8)) errors.principal = "Enter the amount lent.";
  const emi = Math.round(Number(String(input.emi ?? "").replace(/[, ]/g, "")));
  if (!(emi > 0 && emi <= 1e8)) errors.emi = "Enter the monthly instalment.";
  else if (principal > 0 && emi > principal) errors.emi = "The instalment cannot be more than the amount lent.";
  const startMonth = String(input.startMonth ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) errors.startMonth = "Choose the first month it is recovered.";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { employeeId, name, principal, emi, startMonth, note: String(input.note ?? "").trim().slice(0, 300) || null } };
}

export async function createLoan(input: LoanInput, actorId: string): Promise<Loan> {
  const doc: Loan = { _id: newId(), ...input, balance: input.principal, status: "active", payments: [], ...createStamp(actorId) };
  await (await col()).insertOne(doc);
  return doc;
}

export async function cancelLoan(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await col();
  const l = await c.findOne({ _id: id, deletedAt: null });
  if (!l) return { ok: false, error: "Loan not found." };
  if (l.payments.length > 0) return { ok: false, error: "Instalments have already been recovered. Write off the balance instead." };
  await c.updateOne({ _id: id }, { $set: { status: "cancelled", ...updateStamp(actorId) } });
  return { ok: true };
}

/** Writes off what is left (the employee leaves owing nothing, or the company forgives it). */
export async function writeOffLoan(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await (await col()).updateOne({ _id: id, status: "active", deletedAt: null }, { $set: { status: "closed", balance: 0, note: "Written off", ...updateStamp(actorId) } });
  return res.matchedCount === 1 ? { ok: true } : { ok: false, error: "Loan not found or already closed." };
}

/** Instalments falling due in `month`, by employee. */
export async function instalmentsDue(month: string, employeeIds?: string[]): Promise<Map<string, LoanInstalment[]>> {
  const rows = await (await col()).find({ status: "active", balance: { $gt: 0 }, startMonth: { $lte: month }, deletedAt: null, ...(employeeIds ? { employeeId: { $in: employeeIds } } : {}) }).sort({ createdAt: 1 }).toArray();
  const out = new Map<string, LoanInstalment[]>();
  for (const l of rows) {
    // A month already booked by an approved run is not due again.
    if (l.payments.some((p) => p.month === month)) continue;
    const list = out.get(l.employeeId) ?? [];
    list.push({ loanId: l._id, name: l.name, emi: Math.min(l.emi, l.balance) });
    out.set(l.employeeId, list);
  }
  return out;
}

/** Outstanding loans for an employee, for the final settlement. */
export async function outstandingFor(employeeId: string): Promise<{ loanId: string; name: string; balance: number }[]> {
  return (await listLoans({ employeeId, status: "active" })).filter((l) => l.balance > 0).map((l) => ({ loanId: l._id, name: l.name, balance: l.balance }));
}

/** Books what the approved payslips recovered. `recovered` is loan id → amount actually deducted. */
export async function applyRecoveries(runId: string, month: string, recovered: { loanId: string; amount: number }[]): Promise<void> {
  const c = await col();
  for (const r of recovered) {
    if (r.amount <= 0) continue;
    const l = await c.findOne({ _id: r.loanId });
    if (!l || l.payments.some((p) => p.runId === runId)) continue;
    const balance = Math.max(0, l.balance - r.amount);
    await c.updateOne({ _id: r.loanId }, { $set: { balance, status: balance === 0 ? "closed" : "active", updatedAt: new Date() }, $push: { payments: { month, runId, amount: r.amount, at: new Date() } } });
  }
}

/** Takes back what a deleted run had booked. */
export async function reverseRecoveries(runId: string): Promise<void> {
  const c = await col();
  const rows = await c.find({ "payments.runId": runId }).toArray();
  for (const l of rows) {
    const paid = l.payments.filter((p) => p.runId === runId).reduce((n, p) => n + p.amount, 0);
    await c.updateOne({ _id: l._id }, { $set: { balance: l.balance + paid, status: "active", updatedAt: new Date() }, $pull: { payments: { runId } } as never });
  }
}
