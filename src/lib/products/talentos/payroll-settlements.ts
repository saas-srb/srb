import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/products/talentos/db";
import type { ExitReason } from "@/lib/products/talentos/payroll/settlement";

/**
 * The facts of an employee's exit that HR enters for the full and final settlement (`hrms_payroll_settlements`, one per employee): how many
 * days of leave are paid out, notice that was not served, other dues, whether gratuity is paid now. The payroll run for the month of the last
 * working day reads it and adds the earnings and recoveries to that person's final payslip.
 */

export const SETTLEMENTS_COLLECTION = "hrms_payroll_settlements";

export const EXIT_REASONS: { value: ExitReason; label: string }[] = [
  { value: "resignation", label: "Resignation" },
  { value: "retirement", label: "Retirement" },
  { value: "termination", label: "Termination" },
  { value: "end_of_contract", label: "End of contract" },
  { value: "disability", label: "Disability" },
  { value: "death", label: "Death" },
];

export interface Settlement extends AuditFields {
  _id: string;
  employeeId: string;
  reason: ExitReason;
  /** Last working day. */
  exitDate: string;
  /** The payroll month it is paid in (the month of the last working day). */
  month: string;
  leaveDaysToEncash: number;
  noticeShortfallDays: number;
  otherEarnings: { name: string; amount: number; taxable: boolean }[];
  otherRecoveries: { name: string; amount: number }[];
  payGratuity: boolean;
  fixedTerm: boolean;
  note: string | null;
  status: "draft" | "applied";
  runId: string | null;
}

let indexEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<Settlement>(SETTLEMENTS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await c.createIndex({ employeeId: 1 }, { unique: true }).catch(() => {});
    await c.createIndex({ month: 1 }).catch(() => {});
  }
  return c;
}

export async function getSettlement(employeeId: string): Promise<Settlement | null> {
  return (await col()).findOne({ employeeId });
}

export async function settlementsForMonth(month: string): Promise<Map<string, Settlement>> {
  const rows = await (await col()).find({ month }).toArray();
  return new Map(rows.map((s) => [s.employeeId, s]));
}

export async function listSettlements(): Promise<Settlement[]> {
  return (await col()).find({}).sort({ exitDate: -1 }).toArray();
}

export interface SettlementInputData {
  employeeId: string;
  reason: ExitReason;
  exitDate: string;
  leaveDaysToEncash: number;
  noticeShortfallDays: number;
  otherEarnings: { name: string; amount: number; taxable: boolean }[];
  otherRecoveries: { name: string; amount: number }[];
  payGratuity: boolean;
  fixedTerm: boolean;
  note: string | null;
}

const amt = (v: unknown) => {
  const n = Math.round(Number(String(v ?? "").replace(/[, ]/g, "")));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0;
};

export function validateSettlement(input: Record<string, unknown>): { valid: true; data: SettlementInputData } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const employeeId = String(input.employeeId ?? "").trim();
  if (!employeeId) errors.employeeId = "Choose the employee.";
  const reason = EXIT_REASONS.find((r) => r.value === input.reason)?.value;
  if (!reason) errors.reason = "Choose why the employee is leaving.";
  const exitDate = String(input.exitDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate) || Number.isNaN(Date.parse(exitDate))) errors.exitDate = "Enter the last working day.";
  const leaveDays = Number(String(input.leaveDaysToEncash ?? "0"));
  if (!(leaveDays >= 0 && leaveDays <= 365)) errors.leaveDaysToEncash = "Enter days from 0 to 365.";
  const notice = Number(String(input.noticeShortfallDays ?? "0"));
  if (!(notice >= 0 && notice <= 365)) errors.noticeShortfallDays = "Enter days from 0 to 365.";
  const list = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  const otherEarnings = list(input.otherEarnings).map((e) => ({ name: String(e.name ?? "").trim().slice(0, 80), amount: amt(e.amount), taxable: e.taxable !== false && e.taxable !== "false" })).filter((e) => e.name && e.amount > 0);
  const otherRecoveries = list(input.otherRecoveries).map((e) => ({ name: String(e.name ?? "").trim().slice(0, 80), amount: amt(e.amount) })).filter((e) => e.name && e.amount > 0);
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      employeeId,
      reason: reason!,
      exitDate,
      leaveDaysToEncash: Math.round(leaveDays * 2) / 2,
      noticeShortfallDays: Math.round(notice),
      otherEarnings,
      otherRecoveries,
      payGratuity: input.payGratuity !== false && input.payGratuity !== "false",
      fixedTerm: input.fixedTerm === true || input.fixedTerm === "true",
      note: String(input.note ?? "").trim().slice(0, 300) || null,
    },
  };
}

/** Saves the settlement. Once a run has used it, it can only be changed after that run is deleted. */
export async function saveSettlement(data: SettlementInputData, actorId: string): Promise<{ ok: true; settlement: Settlement } | { ok: false; error: string }> {
  const c = await col();
  const existing = await c.findOne({ employeeId: data.employeeId });
  if (existing?.status === "applied") return { ok: false, error: "A payroll run has already paid this settlement." };
  const month = data.exitDate.slice(0, 7);
  if (existing) {
    const res = await c.findOneAndUpdate({ _id: existing._id }, { $set: { ...data, month, ...updateStamp(actorId) } }, { returnDocument: "after" });
    return { ok: true, settlement: res! };
  }
  const doc: Settlement = { _id: newId(), ...data, month, status: "draft", runId: null, ...createStamp(actorId) };
  await c.insertOne(doc);
  return { ok: true, settlement: doc };
}

export async function markSettlementApplied(ids: string[], runId: string): Promise<void> {
  if (ids.length === 0) return;
  await (await col()).updateMany({ _id: { $in: ids } }, { $set: { status: "applied", runId, updatedAt: new Date() } });
}

export async function releaseSettlements(runId: string): Promise<void> {
  await (await col()).updateMany({ runId }, { $set: { status: "draft", runId: null, updatedAt: new Date() } });
}

export async function deleteSettlement(employeeId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await col();
  const s = await c.findOne({ employeeId });
  if (!s) return { ok: false, error: "No settlement." };
  if (s.status === "applied") return { ok: false, error: "A payroll run has already paid this settlement." };
  await c.deleteOne({ _id: s._id });
  return { ok: true };
}
