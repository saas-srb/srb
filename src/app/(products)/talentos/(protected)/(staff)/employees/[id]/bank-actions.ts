"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManagePayroll } from "@/lib/hrms-roles";
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  setPrimaryBankAccount,
  setVerification,
  revealAccountNumber,
} from "@/lib/products/talentos/bank-accounts";
import { validateBankAccount } from "@/lib/products/talentos/validation-payroll";
import { isValidBankVerificationStatus } from "@/lib/products/talentos/payout-status";

export interface BankActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireBank() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManagePayroll(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(employeeId: string) {
  revalidatePath(`/talentos/employees/${employeeId}`);
}

export async function saveBankAccountAction(
  employeeId: string,
  input: Record<string, unknown>,
  id?: string
): Promise<BankActionResult> {
  const user = await requireBank();
  const v = validateBankAccount(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = id
    ? await updateBankAccount(id, v.data, user)
    : await createBankAccount(employeeId, v.data, user);
  if (!result.ok) return { ok: false, error: result.error };

  revalidate(employeeId);
  return { ok: true };
}

export async function setPrimaryBankAccountAction(employeeId: string, id: string): Promise<BankActionResult> {
  const user = await requireBank();
  const result = await setPrimaryBankAccount(id, user);
  if (!result.ok) return { ok: false, error: result.error };
  revalidate(employeeId);
  return { ok: true };
}

export async function setBankVerificationAction(
  employeeId: string,
  id: string,
  status: string,
  note: string
): Promise<BankActionResult> {
  const user = await requireBank();
  if (!isValidBankVerificationStatus(status)) return { ok: false, error: "Invalid verification status." };
  const result = await setVerification(id, status, note.trim() || null, user);
  if (!result.ok) return { ok: false, error: result.error };
  revalidate(employeeId);
  return { ok: true };
}

export async function deleteBankAccountAction(employeeId: string, id: string): Promise<BankActionResult> {
  const user = await requireBank();
  const result = await deleteBankAccount(id, user);
  if (!result.ok) return { ok: false, error: result.error };
  revalidate(employeeId);
  return { ok: true };
}

export async function revealBankAccountAction(id: string): Promise<{ ok: boolean; accountNumber?: string; upiId?: string | null; error?: string }> {
  const user = await requireBank();
  const result = await revealAccountNumber(id, user);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, accountNumber: result.accountNumber, upiId: result.upiId };
}
