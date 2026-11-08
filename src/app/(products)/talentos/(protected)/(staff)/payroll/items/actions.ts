"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { recordAudit } from "@/lib/products/talentos/audit";
import { createAdjustment, cancelAdjustment, validateAdjustment } from "@/lib/products/talentos/payroll-adjustments";
import { createLoan, cancelLoan, writeOffLoan, validateLoan } from "@/lib/products/talentos/payroll-loans";
import { saveSettlement, deleteSettlement, validateSettlement } from "@/lib/products/talentos/payroll-settlements";
import { verifyDeclaration, reopenDeclaration, parseDeductions } from "@/lib/products/talentos/tax-declarations";

export interface ItemResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requirePayroll() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canRunPayroll(user)) throw new Error("Forbidden");
  return user;
}

function refresh() {
  revalidatePath("/talentos/payroll/items");
  revalidatePath("/talentos/payroll/declarations");
  revalidatePath("/talentos/payroll");
}

export async function createAdjustmentAction(input: Record<string, unknown>): Promise<ItemResult> {
  const user = await requirePayroll();
  const v = validateAdjustment(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };
  const a = await createAdjustment(v.data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "payroll_item", entityId: a._id, entityLabel: a.name, summary: `${a.kind} ${a.amount} for ${a.month}`, metadata: { employeeId: a.employeeId } });
  refresh();
  return { ok: true };
}

export async function cancelAdjustmentAction(id: string): Promise<ItemResult> {
  const user = await requirePayroll();
  const r = await cancelAdjustment(id, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "cancel", entity: "payroll_item", entityId: id });
  refresh();
  return { ok: true };
}

export async function createLoanAction(input: Record<string, unknown>): Promise<ItemResult> {
  const user = await requirePayroll();
  const v = validateLoan(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };
  const l = await createLoan(v.data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "payroll_item", entityId: l._id, entityLabel: l.name, summary: `loan ${l.principal}, instalment ${l.emi} from ${v.data.startMonth}`, metadata: { employeeId: l.employeeId } });
  refresh();
  return { ok: true };
}

export async function closeLoanAction(id: string, mode: "cancel" | "write_off"): Promise<ItemResult> {
  const user = await requirePayroll();
  const r = mode === "cancel" ? await cancelLoan(id, user.id) : await writeOffLoan(id, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: mode === "cancel" ? "cancel" : "update", entity: "payroll_item", entityId: id, summary: mode === "cancel" ? "loan cancelled" : "loan written off" });
  refresh();
  return { ok: true };
}

export async function saveSettlementAction(input: Record<string, unknown>): Promise<ItemResult> {
  const user = await requirePayroll();
  const v = validateSettlement(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };
  const r = await saveSettlement(v.data, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "payroll_item", entityId: r.settlement._id, entityLabel: "Final settlement", summary: `exit ${v.data.exitDate}`, metadata: { employeeId: v.data.employeeId } });
  refresh();
  return { ok: true };
}

export async function deleteSettlementAction(employeeId: string): Promise<ItemResult> {
  const user = await requirePayroll();
  const r = await deleteSettlement(employeeId);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "payroll_item", entityId: employeeId, entityLabel: "Final settlement" });
  refresh();
  return { ok: true };
}

export async function verifyDeclarationAction(id: string, verified: Record<string, unknown>, note: string): Promise<ItemResult> {
  const user = await requirePayroll();
  const ok = await verifyDeclaration(id, parseDeductions(verified), note.trim().slice(0, 300) || null, user.id);
  if (!ok) return { ok: false, error: "Declaration not found." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "approve", entity: "tax_declaration", entityId: id });
  refresh();
  return { ok: true };
}

export async function reopenDeclarationAction(id: string, note: string): Promise<ItemResult> {
  const user = await requirePayroll();
  const ok = await reopenDeclaration(id, note.trim().slice(0, 300) || null, user.id);
  if (!ok) return { ok: false, error: "Declaration not found." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "tax_declaration", entityId: id, summary: "reopened" });
  refresh();
  return { ok: true };
}
