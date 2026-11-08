"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import type { TaxPaymentKind } from "@/lib/products/cashflow-ai/income-tax/core";
import { cancelPayment, createPayment, saveSchedule } from "@/lib/products/cashflow-ai/income-tax/payments-store";

async function manager() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageCompliance(user)) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}

function refresh() {
  revalidatePath("/cashflow-ai/income-tax", "layout");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai/bank-accounts");
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const number = (v: unknown) => Number(text(v, 20).replace(/[, ]/g, ""));

export async function recordTaxPaymentAction(raw: Record<string, unknown>): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const actor = await manager();
  const amount = number(raw.amount);
  if (!Number.isFinite(amount)) return { ok: false, error: "Enter the amount paid." };
  const r = await createPayment(
    {
      fy: text(raw.fy, 7),
      kind: text(raw.kind, 20) as TaxPaymentKind,
      amount,
      paidOn: text(raw.paidOn, 10),
      bsrCode: text(raw.bsrCode, 7),
      serial: text(raw.serial, 5),
      note: text(raw.note, 300) || null,
      bankAccountId: text(raw.bankAccountId, 64),
    },
    actor,
  );
  if (!r.ok) return r;
  refresh();
  return { ok: true, message: r.ledgerPosted ? "Payment recorded and taken out of the bank account in your books." : "Payment recorded. Accrual books are off, so nothing was posted to the ledger." };
}

export async function cancelTaxPaymentAction(id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await manager();
  const r = await cancelPayment(text(id, 64), text(reason, 300), actor);
  if (r.ok) refresh();
  return r;
}

export async function saveScheduleAction(raw: { fy: string; instalments: { dueDate: string; percent: string }[]; note: string; estimate: string; confirmed: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await manager();
  const fy = text(raw.fy, 7);
  if (!isFinancialYear(fy)) return { ok: false, error: "Financial year must look like 2026-27." };
  if (!Array.isArray(raw.instalments)) return { ok: false, error: "Enter the instalments." };
  const instalments = raw.instalments.slice(0, 13).map((i) => ({ dueDate: text(i?.dueDate, 10), cumulativePercent: number(i?.percent) }));
  const estimateText = text(raw.estimate, 20);
  const estimate = estimateText === "" ? null : number(estimateText);
  if (estimate !== null && !Number.isFinite(estimate)) return { ok: false, error: "The estimate must be a number." };
  const r = await saveSchedule(fy, { instalments, note: text(raw.note, 500) || null, estimate, confirmed: raw.confirmed === true }, actor);
  if (r.ok) refresh();
  return r;
}
