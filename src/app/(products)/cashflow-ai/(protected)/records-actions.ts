"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-access";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { saveVendorRecord } from "@/lib/products/spendiq/vendor-write";
import { saveBillRecord, attachBillFile, decideBill, deleteBill } from "@/lib/products/spendiq/bill-write";
import { saveClientRecord } from "@/lib/products/sprintos/client-write";
import type { RecordWriteResult } from "@/lib/products/shared/record-write";

/**
 * Vendors, vendor bills and customers entered from CashFlow, for a company that doesn't have the product that normally
 * keeps them (SpendIQ for vendors and bills, SprintOS for clients). With that product, they are managed there only, so
 * its own permissions and approvals can't be bypassed from here.
 */
async function requireKeeper(owner: "prms" | "pms") {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");
  if (!(await hiddenProducts()).has(owner)) throw new Error("Forbidden");
  return user;
}

const done = (result: RecordWriteResult, list: string, id: string | undefined = result.id) => {
  if (result.ok) {
    revalidatePath(`/cashflow-ai/${list}`);
    if (id) revalidatePath(`/cashflow-ai/${list}/${id}`);
    revalidatePath("/cashflow-ai");
  }
  return result;
};

export async function saveVendorFromCashflowAction(input: Record<string, unknown>, id?: string): Promise<RecordWriteResult> {
  const user = await requireKeeper("prms");
  return done(await saveVendorRecord(user, input, id), "vendors");
}

export async function saveBillFromCashflowAction(input: Record<string, unknown>, id?: string): Promise<RecordWriteResult> {
  const user = await requireKeeper("prms");
  return done(await saveBillRecord(user, input, id), "bills");
}

export async function attachBillFileFromCashflowAction(id: string, formData: FormData): Promise<RecordWriteResult> {
  const user = await requireKeeper("prms");
  return done(await attachBillFile(user, id, formData), "bills", id);
}

export async function decideBillFromCashflowAction(id: string, status: string): Promise<RecordWriteResult> {
  const user = await requireKeeper("prms");
  return done(await decideBill(user, id, status), "bills", id);
}

export async function deleteBillFromCashflowAction(id: string): Promise<RecordWriteResult> {
  const user = await requireKeeper("prms");
  const result = await deleteBill(user, id);
  if (result.ok) revalidatePath("/cashflow-ai/bills");
  return result;
}

export async function saveClientFromCashflowAction(input: Record<string, unknown>, id?: string): Promise<RecordWriteResult> {
  const user = await requireKeeper("pms");
  return done(await saveClientRecord(user, input, id), "customers");
}
