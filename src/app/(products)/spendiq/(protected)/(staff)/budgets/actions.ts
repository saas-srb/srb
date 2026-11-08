"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageFinance } from "@/lib/prms-roles";
import { createBudget, updateBudget, deleteBudget, getBudget, refreshBudgetConsumption, type BudgetWriteData } from "@/lib/products/spendiq/budgets";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { isValidBudgetLevel, isValidBudgetPeriod, type BudgetLevel, type BudgetPeriod } from "@/lib/products/spendiq/constants";

export interface BudgetActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireFinance() {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageFinance(user)) throw new Error("Forbidden");
  return user;
}

function revalidate() {
  revalidatePath("/spendiq/budgets");
  revalidatePath("/spendiq");
}

export async function saveBudgetAction(input: Record<string, unknown>, id?: string): Promise<BudgetActionResult> {
  const user = await requireFinance();
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, fieldErrors: { name: "Name is required." } };
  const level = String(input.level ?? "company");
  if (!isValidBudgetLevel(level)) return { ok: false, fieldErrors: { level: "Unknown level." } };
  const period = String(input.period ?? "yearly");
  if (!isValidBudgetPeriod(period)) return { ok: false, fieldErrors: { period: "Unknown period." } };
  const periodStart = String(input.periodStart ?? "");
  const periodEnd = String(input.periodEnd ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return { ok: false, fieldErrors: { periodStart: "Enter a valid date." } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return { ok: false, fieldErrors: { periodEnd: "Enter a valid date." } };
  if (periodEnd < periodStart) return { ok: false, fieldErrors: { periodEnd: "End is before start." } };
  const allocatedAmount = Number(input.allocatedAmount);
  if (!Number.isFinite(allocatedAmount) || allocatedAmount <= 0) return { ok: false, fieldErrors: { allocatedAmount: "Enter an allocation." } };

  const data: BudgetWriteData = {
    name,
    level: level as BudgetLevel,
    scopeId: level === "company" ? null : (input.scopeId as string) || null,
    scopeName: level === "company" ? null : (input.scopeName as string) || null,
    period: period as BudgetPeriod,
    periodStart,
    periodEnd,
    allocatedAmount,
    currency: String(input.currency ?? "INR"),
    notes: (input.notes as string)?.trim() || null,
  };

  if (id) {
    const before = await getBudget(id);
    if (!before) return { ok: false, error: "Budget not found." };
    await updateBudget(id, data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "budget", entityId: id, entityLabel: name });
    revalidate();
    return { ok: true, id };
  }
  const created = await createBudget(data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "budget", entityId: created._id, entityLabel: created.budgetCode });
  revalidate();
  return { ok: true, id: created._id };
}

export async function refreshBudgetsAction(): Promise<BudgetActionResult> {
  await requireFinance();
  await refreshBudgetConsumption();
  revalidate();
  return { ok: true };
}

export async function deleteBudgetAction(id: string): Promise<BudgetActionResult> {
  const user = await requireFinance();
  const before = await getBudget(id);
  await deleteBudget(id, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "budget", entityId: id, entityLabel: before?.budgetCode ?? null });
  revalidate();
  return { ok: true };
}
