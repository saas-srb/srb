import "server-only";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { isDateString, todayDateString } from "@/lib/products/talentos/settings";
import { createBankAccount, listBankAccounts, type BankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { recordTransfer } from "@/lib/products/cashflow-ai/fund-transfers";
import { razorpayxAccountId } from "@/lib/products/cashflow-ai/payments/payouts";
import { isEncryptionConfigured } from "@/lib/products/cashflow-ai/crypto";

/**
 * The company's own bank accounts, as CashFlow keeps them (`fms_bank_accounts`, number encrypted). Salaries and every other payment leave
 * from the company's RazorpayX balance, so the current account's part is to fund it: money moves from the current account to RazorpayX (a
 * transfer between the company's own accounts, recorded here), and each payout RazorpayX makes is an expense against the RazorpayX balance.
 * Government dues (PF, ESI, tax, professional tax) are paid on the government portals, from a current account, and recorded against it.
 */

export interface PayingAccount {
  _id: string;
  accountName: string;
  bankName: string;
  last4: string | null;
  ifsc: string | null;
  balance: number;
  label: string;
}

const labelOf = (a: Pick<BankAccount, "accountName" | "bankName" | "accountNumberLast4">) => `${a.accountName} (${a.bankName}${a.accountNumberLast4 ? ` ••${a.accountNumberLast4}` : ""})`;

/** The company's active bank accounts. */
export async function payingAccounts(): Promise<PayingAccount[]> {
  return (await listBankAccounts({ status: "active" })).map((a) => ({ _id: a._id, accountName: a.accountName, bankName: a.bankName, last4: a.accountNumberLast4, ifsc: a.ifsc, balance: a.currentBalance, label: labelOf(a) }));
}

export interface AccountInput {
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  openingBalance: number;
}

export function validateAccount(input: Record<string, unknown>): { valid: true; data: AccountInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const accountName = String(input.accountName ?? "").trim().slice(0, 80);
  if (!accountName) errors.accountName = "Give the account a name, for example “HDFC current account”.";
  const bankName = String(input.bankName ?? "").trim().slice(0, 80);
  if (!bankName) errors.bankName = "Enter the bank's name.";
  const accountNumber = String(input.accountNumber ?? "").replace(/\s+/g, "");
  if (!/^\d{9,18}$/.test(accountNumber)) errors.accountNumber = "An account number is 9 to 18 digits.";
  const ifsc = String(input.ifsc ?? "").trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) errors.ifsc = "IFSC is four letters, a zero, then six letters or digits.";
  const opening = Number(String(input.openingBalance ?? "0").replace(/[, ]/g, ""));
  if (!Number.isFinite(opening) || opening < 0 || opening > 1e11) errors.openingBalance = "Enter the balance today (0 if you are not sure).";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { accountName, bankName, accountNumber, ifsc, openingBalance: Math.round(opening * 100) / 100 } };
}

export async function addCompanyAccount(data: AccountInput, actorId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isEncryptionConfigured()) return { ok: false, error: "Secure storage for bank details is not set up on this server (PLATFORM_ENCRYPTION_KEY), so the account number cannot be saved. Ask your administrator." };
  const r = await createBankAccount({ ...data, branch: null, currency: "INR", status: "active", notes: "Added from Payroll" }, actorId);
  return r.ok ? { ok: true, id: r.account._id } : { ok: false, error: r.reason };
}

/** The account to suggest: the company's chosen salary account if it is still active, else the only account there is. */
export async function suggestedAccountId(accounts: PayingAccount[]): Promise<string | null> {
  const chosen = (await getPayrollConfig()).salaryAccountId;
  if (chosen && accounts.some((a) => a._id === chosen)) return chosen;
  return accounts.length === 1 ? accounts[0]._id : null;
}

/** Money moved from the company's current account into its RazorpayX balance: one transfer between the company's own accounts. */
export async function recordTopUp(input: { fromAccountId: string; amount: number; date: string; reference: string | null }, actor: { id: string; email: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDateString(input.date) || input.date > todayDateString()) return { ok: false, error: "Enter the date the money left your bank (not in the future)." };
  if (!(input.amount >= 1)) return { ok: false, error: "Enter the amount you added." };
  const accounts = await payingAccounts();
  if (!accounts.some((a) => a._id === input.fromAccountId)) return { ok: false, error: "Choose one of your current accounts." };
  const toId = await razorpayxAccountId(actor.id);
  const r = await recordTransfer({ fromAccountId: input.fromAccountId, fromAccountType: "bank", toAccountId: toId, toAccountType: "bank", amount: input.amount, transferDate: input.date, referenceNumber: input.reference, notes: "Top-up of the RazorpayX balance" }, actor.id, actor.email);
  return r.ok ? { ok: true } : { ok: false, error: r.reason };
}
