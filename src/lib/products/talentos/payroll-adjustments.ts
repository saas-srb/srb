import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/products/talentos/db";
import type { PayrollAdjustment } from "@/lib/products/talentos/payroll/compute";

/**
 * One-off items on a month's payroll (`hrms_payroll_adjustments`): arrears, a bonus, an incentive, a reimbursement, a recovery. HR enters them
 * before (or while) a run is in draft; the run picks up every pending item for its month. Approving the run marks them applied, and deleting
 * an approved run puts them back to pending, so an item is never paid twice and never lost.
 */

export const ADJUSTMENTS_COLLECTION = "hrms_payroll_adjustments";

export const ADJUSTMENT_CATEGORIES = [
  { value: "arrears", label: "Arrears", kind: "earning" },
  { value: "bonus", label: "Bonus", kind: "earning" },
  { value: "incentive", label: "Incentive / commission", kind: "earning" },
  { value: "reimbursement", label: "Reimbursement", kind: "earning" },
  { value: "other_earning", label: "Other earning", kind: "earning" },
  { value: "recovery", label: "Recovery", kind: "deduction" },
  { value: "other_deduction", label: "Other deduction", kind: "deduction" },
] as const;
export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number]["value"];

export interface Adjustment extends AuditFields {
  _id: string;
  employeeId: string;
  month: string;
  kind: "earning" | "deduction";
  category: AdjustmentCategory;
  name: string;
  amount: number;
  taxable: boolean;
  pf: boolean;
  esi: boolean;
  note: string | null;
  status: "pending" | "applied" | "cancelled";
  runId: string | null;
  /** The employee's claim this reimbursement pays (`hrms_work_requests`), if it came from one. */
  requestId?: string | null;
}

let indexEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<Adjustment>(ADJUSTMENTS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await c.createIndex({ month: 1, employeeId: 1 }).catch(() => {});
    await c.createIndex({ runId: 1 }).catch(() => {});
  }
  return c;
}

export async function listAdjustments(opts: { month?: string; employeeId?: string; status?: Adjustment["status"] } = {}): Promise<Adjustment[]> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (opts.month) filter.month = opts.month;
  if (opts.employeeId) filter.employeeId = opts.employeeId;
  if (opts.status) filter.status = opts.status;
  return (await col()).find(filter).sort({ month: -1, createdAt: -1 }).toArray();
}

/** Pending items for a month, by employee, as the payroll engine takes them. */
export async function pendingForMonth(month: string, employeeIds?: string[]): Promise<Map<string, PayrollAdjustment[]>> {
  const rows = await (await col()).find({ month, status: "pending", deletedAt: null, ...(employeeIds ? { employeeId: { $in: employeeIds } } : {}) }).toArray();
  const out = new Map<string, PayrollAdjustment[]>();
  for (const r of rows) {
    const list = out.get(r.employeeId) ?? [];
    list.push({ id: r._id, kind: r.kind, name: r.name, amount: r.amount, taxable: r.taxable, pf: r.pf, esi: r.esi });
    out.set(r.employeeId, list);
  }
  return out;
}

export interface AdjustmentInput {
  employeeId: string;
  month: string;
  category: AdjustmentCategory;
  name: string;
  amount: number;
  taxable: boolean;
  pf: boolean;
  esi: boolean;
  note: string | null;
}

export function validateAdjustment(input: Record<string, unknown>): { valid: true; data: AdjustmentInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const employeeId = String(input.employeeId ?? "").trim();
  if (!employeeId) errors.employeeId = "Choose the employee.";
  const month = String(input.month ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors.month = "Choose the payroll month.";
  const cat = ADJUSTMENT_CATEGORIES.find((c) => c.value === input.category);
  if (!cat) errors.category = "Choose what kind of item this is.";
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) errors.name = "Give it a name that will appear on the payslip.";
  const amount = Math.round(Number(String(input.amount ?? "").replace(/[, ]/g, "")));
  if (!(amount > 0 && amount <= 1e8)) errors.amount = "Enter an amount above zero.";
  const flag = (v: unknown, d: boolean) => (v === undefined ? d : v === true || v === "true" || v === "on");
  const isEarning = cat?.kind === "earning";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      employeeId,
      month,
      category: cat!.value,
      name,
      amount,
      // A reimbursement against bills is not taxable and not wages; everything else an employer pays is.
      taxable: isEarning ? flag(input.taxable, cat!.value !== "reimbursement") : false,
      pf: isEarning ? flag(input.pf, false) : false,
      esi: isEarning ? flag(input.esi, cat!.value !== "reimbursement" && cat!.value !== "bonus") : false,
      note: String(input.note ?? "").trim().slice(0, 300) || null,
    },
  };
}

export async function createAdjustment(input: AdjustmentInput & { requestId?: string | null }, actorId: string): Promise<Adjustment> {
  const kind = ADJUSTMENT_CATEGORIES.find((c) => c.value === input.category)!.kind;
  const doc: Adjustment = { _id: newId(), ...input, kind, status: "pending", runId: null, ...createStamp(actorId) };
  await (await col()).insertOne(doc);
  return doc;
}

/** Only an item no approved run has used can be cancelled. */
export async function cancelAdjustment(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await col();
  const row = await c.findOne({ _id: id, deletedAt: null });
  if (!row) return { ok: false, error: "Item not found." };
  if (row.status === "applied") return { ok: false, error: "An approved payroll run has already used this item." };
  await c.updateOne({ _id: id }, { $set: { status: "cancelled", ...updateStamp(actorId) } });
  return { ok: true };
}

export async function markApplied(ids: string[], runId: string): Promise<void> {
  if (ids.length === 0) return;
  await (await col()).updateMany({ _id: { $in: ids }, status: "pending" }, { $set: { status: "applied", runId, updatedAt: new Date() } });
}

export async function releaseRun(runId: string): Promise<void> {
  await (await col()).updateMany({ runId, status: "applied" }, { $set: { status: "pending", runId: null, updatedAt: new Date() } });
}
