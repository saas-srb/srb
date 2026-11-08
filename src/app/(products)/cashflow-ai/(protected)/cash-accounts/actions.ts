"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageBanking } from "@/lib/fms-roles";
import { createCashAccount, updateCashAccount, deleteCashAccount, getCashAccount, type CashAccountWriteData } from "@/lib/products/cashflow-ai/cash-accounts";
import { isValidFundAccountStatus, DEFAULT_CURRENCY } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface CashAccountActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(id?: string) {
  revalidatePath("/cashflow-ai/cash-accounts");
  revalidatePath("/cashflow-ai");
  if (id) revalidatePath(`/cashflow-ai/cash-accounts/${id}`);
}

export async function saveCashAccountAction(input: Record<string, unknown>, id?: string): Promise<CashAccountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageBanking(user)) throw new Error("Forbidden");

  const accountName = String(input.accountName ?? "").trim();
  if (!accountName) return { ok: false, fieldErrors: { accountName: "Enter an account name." } };
  const status = String(input.status ?? "active");

  const data: CashAccountWriteData = {
    accountName,
    location: (input.location as string)?.trim() || null,
    department: (input.department as string)?.trim() || null,
    currency: String(input.currency ?? DEFAULT_CURRENCY),
    status: isValidFundAccountStatus(status) ? status : "active",
    notes: (input.notes as string)?.trim() || null,
  };

  if (id) {
    const account = await updateCashAccount(id, data, user.id);
    if (!account) return { ok: false, error: "Cash account not found." };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "cash_account", entityId: id, entityLabel: account.accountName });
    revalidate(id);
    return { ok: true, id };
  }

  const created = await createCashAccount({ ...data, openingBalance: Number(input.openingBalance) || 0 }, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "cash_account", entityId: created._id, entityLabel: created.accountName });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function deleteCashAccountAction(id: string): Promise<CashAccountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageBanking(user)) throw new Error("Forbidden");
  const before = await getCashAccount(id);
  const res = await deleteCashAccount(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "cash_account", entityId: id, entityLabel: before?.accountName });
  revalidate();
  return { ok: true };
}
