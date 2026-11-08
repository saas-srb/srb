"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageBanking } from "@/lib/fms-roles";
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  revealBankAccountNumber,
  getBankAccount,
  type BankAccountCreateData,
  type BankAccountWriteData,
} from "@/lib/products/cashflow-ai/bank-accounts";
import { isValidFundAccountStatus, DEFAULT_CURRENCY } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface BankAccountActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(id?: string) {
  revalidatePath("/cashflow-ai/bank-accounts");
  revalidatePath("/cashflow-ai");
  if (id) revalidatePath(`/cashflow-ai/bank-accounts/${id}`);
}

function buildWriteData(input: Record<string, unknown>): BankAccountWriteData {
  const status = String(input.status ?? "active");
  return {
    accountName: String(input.accountName ?? "").trim(),
    bankName: String(input.bankName ?? "").trim(),
    accountNumber: (input.accountNumber as string)?.trim() || null,
    ifsc: (input.ifsc as string)?.trim() || null,
    branch: (input.branch as string)?.trim() || null,
    currency: String(input.currency ?? DEFAULT_CURRENCY),
    status: isValidFundAccountStatus(status) ? status : "active",
    notes: (input.notes as string)?.trim() || null,
  };
}

export async function saveBankAccountAction(input: Record<string, unknown>, id?: string): Promise<BankAccountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageBanking(user)) throw new Error("Forbidden");

  const base = buildWriteData(input);
  if (!base.accountName) return { ok: false, fieldErrors: { accountName: "Enter an account name." } };
  if (!base.bankName) return { ok: false, fieldErrors: { bankName: "Enter a bank name." } };

  if (id) {
    const res = await updateBankAccount(id, base, user.id);
    if (!res.ok) return { ok: false, error: res.reason };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "bank_account", entityId: id, entityLabel: res.account.accountName });
    revalidate(id);
    return { ok: true, id };
  }

  const data: BankAccountCreateData = { ...base, openingBalance: Number(input.openingBalance) || 0 };
  const res = await createBankAccount(data, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "bank_account", entityId: res.account._id, entityLabel: res.account.accountName });
  revalidate(res.account._id);
  return { ok: true, id: res.account._id };
}

export async function deleteBankAccountAction(id: string): Promise<BankAccountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageBanking(user)) throw new Error("Forbidden");
  const before = await getBankAccount(id);
  const res = await deleteBankAccount(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "bank_account", entityId: id, entityLabel: before?.accountName });
  revalidate();
  return { ok: true };
}

export async function revealBankAccountNumberAction(id: string): Promise<{ ok: boolean; number?: string; error?: string }> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageBanking(user)) throw new Error("Forbidden");
  const number = await revealBankAccountNumber(id);
  if (!number) return { ok: false, error: "No account number on file, or the encryption key is not configured." };
  const account = await getBankAccount(id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "export",
    entity: "bank_account",
    entityId: id,
    entityLabel: account?.accountName,
    summary: "Revealed full account number",
  });
  return { ok: true, number };
}
