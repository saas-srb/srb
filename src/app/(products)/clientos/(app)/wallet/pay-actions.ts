"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { payTrainingFeeWithCredits, payInvoiceWithCredits, type PayResult } from "@/lib/wallet/panel-redemption";

export async function payFeeWithCreditsAction(planId: string): Promise<PayResult> {
  const user = await getCurrentPortalUser();
  if (!user || (user.role !== "trainee" && user.role !== "intern")) return { ok: false, error: "Not allowed." };
  const res = await payTrainingFeeWithCredits(user, planId);
  if (res.ok) {
    revalidatePath("/clientos/payments");
    revalidatePath("/clientos/wallet");
  }
  return res;
}

export async function payInvoiceWithCreditsAction(invoiceNumber: string): Promise<PayResult> {
  const user = await getCurrentPortalUser();
  if (!user || user.role !== "client") return { ok: false, error: "Not allowed." };
  const res = await payInvoiceWithCredits(user, invoiceNumber);
  if (res.ok) {
    revalidatePath("/clientos/invoices");
    revalidatePath("/clientos/wallet");
  }
  return res;
}
