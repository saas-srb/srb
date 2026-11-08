"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageFiscalPeriods } from "@/lib/fms-roles";
import { activateAccrual, postMissingAccruals } from "@/lib/products/cashflow-ai/accrual/engine";

async function admin() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageFiscalPeriods(user)) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}

function refresh() {
  for (const path of ["/cashflow-ai/settings/accrual", "/cashflow-ai/trial-balance", "/cashflow-ai/general-ledger", "/cashflow-ai/reports/balance-sheet", "/cashflow-ai/reports/profit-and-loss", "/cashflow-ai"]) revalidatePath(path);
  revalidatePath("/cashflow-ai/compliance", "layout");
}

export async function activateAccrualAction(revenueAccountId: string, expenseAccountId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const actor = await admin();
  const r = await activateAccrual({ revenueAccountId, expenseAccountId }, actor);
  if (!r.ok) return r;
  refresh();
  return { ok: true, message: `Accrual books are on from ${r.startDate}. Opening receivable ${r.openingReceivable.toFixed(2)}, opening payable ${r.openingPayable.toFixed(2)}.` };
}

export async function postMissingAccrualsAction(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const actor = await admin();
  const r = await postMissingAccruals(actor);
  refresh();
  if (r.failed.length > 0) return { ok: false, error: `${r.posted} posted, ${r.failed.length} could not be: ${r.failed.slice(0, 3).map((f) => `${f.kind} — ${f.error}`).join("; ")}` };
  return { ok: true, message: r.posted ? `${r.posted} document${r.posted === 1 ? "" : "s"} posted.` : "Nothing was missing." };
}
