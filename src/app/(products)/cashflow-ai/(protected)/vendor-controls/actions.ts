"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions, canManageCompliance, canManageTransactions } from "@/lib/fms-roles";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { adjustAdvance, createAdvance, refundAdvance, saveMsme, saveMsmeDays, verifyVendorDetails } from "@/lib/products/cashflow-ai/vendor-controls/store";
import { istToday } from "@/lib/products/cashflow-ai/vendor-controls/core";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function who(allowed: (u: NonNullable<Awaited<ReturnType<typeof getCurrentFmsUser>>>) => boolean) {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!allowed(user)) throw new Error("Forbidden");
  return { id: user.id, email: user.email ?? null };
}

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

function refresh() {
  revalidatePath("/cashflow-ai/vendor-controls");
}

/** Marks a vendor's changed bank details as checked. Confirmed with the payment code, as it decides where money can go. */
export async function verifyBankDetailsAction(vendorId: string, token: string, method: string, note: string, code: string): Promise<Result> {
  const actor = await who(canApproveTransactions);
  const blocked = await paymentGate(actor.id, code);
  if (blocked) return { ok: false, error: blocked };
  const r = await verifyVendorDetails(str(vendorId, 80), { token: str(token, 80), method: str(method, 40), note: str(note, 600) }, actor);
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: "Verified. Payments to this vendor now use the new details." } : r;
}

export async function saveMsmeDaysAction(days: string): Promise<Result> {
  const actor = await who(canManageCompliance);
  const r = await saveMsmeDays(str(days, 8), actor);
  if (r.ok) refresh();
  return r;
}

export async function saveMsmeAction(vendorId: string, category: string, udyam: string): Promise<Result> {
  const actor = await who(canManageTransactions);
  const r = await saveMsme(str(vendorId, 80), { category: str(category, 12), udyam: str(udyam, 40) }, actor);
  if (r.ok) refresh();
  return r;
}

export async function createAdvanceAction(input: Record<string, unknown>): Promise<Result> {
  const actor = await who(canManageTransactions);
  const r = await createAdvance(str(input.vendorId, 80), { kind: str(input.kind, 12), amount: str(input.amount, 20), paidOn: str(input.paidOn, 10), purpose: str(input.purpose, 300), reference: str(input.reference, 80) }, istToday(), actor);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : r;
}

export async function adjustAdvanceAction(advanceId: string, billId: string, amount: string): Promise<Result> {
  const actor = await who(canManageTransactions);
  const r = await adjustAdvance(str(advanceId, 80), str(billId, 80), str(amount, 20), actor);
  if (r.ok) {
    refresh();
    revalidatePath("/cashflow-ai/vendor-payments");
  }
  return r;
}

export async function refundAdvanceAction(advanceId: string, on: string, note: string): Promise<Result> {
  const actor = await who(canManageTransactions);
  const r = await refundAdvance(str(advanceId, 80), { on: str(on, 10), note: str(note, 300) }, istToday(), actor);
  if (r.ok) refresh();
  return r;
}
