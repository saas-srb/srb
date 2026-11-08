"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { cancelChallan, createChallan } from "@/lib/products/cashflow-ai/tds/challans-store";

async function manager() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageCompliance(user)) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}

function refresh() {
  revalidatePath("/cashflow-ai/tds", "layout");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai/bank-accounts");
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function recordChallanAction(raw: Record<string, unknown>): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const actor = await manager();
  const amount = Number(text(raw.amount, 20).replace(/[, ]/g, ""));
  if (!Number.isFinite(amount)) return { ok: false, error: "Enter the amount deposited." };
  const r = await createChallan(
    {
      forMonth: text(raw.forMonth, 7),
      amount,
      paidOn: text(raw.paidOn, 10),
      bsrCode: text(raw.bsrCode, 7),
      serial: text(raw.serial, 5),
      cin: text(raw.cin, 40) || null,
      note: text(raw.note, 300) || null,
      section: text(raw.section, 10) || null,
      bankAccountId: text(raw.bankAccountId, 64),
    },
    actor,
  );
  if (!r.ok) return r;
  refresh();
  return { ok: true, message: r.ledgerPosted ? "Challan recorded and taken out of the bank account in your books." : "Challan recorded. Accrual books are off, so nothing was posted to the ledger." };
}

export async function cancelChallanAction(id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await manager();
  const r = await cancelChallan(text(id, 64), text(reason, 300), actor);
  if (r.ok) refresh();
  return r;
}
