"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canReconcile } from "@/lib/fms-roles";
import { recordCashCount, type RecordCashCountData } from "@/lib/products/cashflow-ai/cash-reconciliation";

export interface CashCountActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate() {
  revalidatePath("/cashflow-ai/cash-reconciliation");
  revalidatePath("/cashflow-ai/cash-accounts");
  revalidatePath("/cashflow-ai");
}

export async function recordCashCountAction(input: Record<string, unknown>): Promise<CashCountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canReconcile(user)) throw new Error("Forbidden");

  const cashAccountId = String(input.cashAccountId ?? "");
  if (!cashAccountId) return { ok: false, fieldErrors: { cashAccountId: "Select a cash account." } };
  const physicalCount = Number(input.physicalCount);
  if (!Number.isFinite(physicalCount) || physicalCount < 0) return { ok: false, fieldErrors: { physicalCount: "Enter the counted amount." } };

  const data: RecordCashCountData = {
    cashAccountId,
    countDate: String(input.countDate ?? new Date().toISOString().slice(0, 10)),
    physicalCount,
    notes: (input.notes as string)?.trim() || null,
  };

  const res = await recordCashCount(data, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };
  revalidate();
  return { ok: true, id: res.count._id };
}
