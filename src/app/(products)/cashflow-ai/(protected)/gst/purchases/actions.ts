"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canViewFinancialStatements } from "@/lib/fms-roles";
import { isMonth } from "@/lib/products/cashflow-ai/gst/core";
import { saveItcDecision } from "@/lib/products/cashflow-ai/gst/store";
import { loadPurchasesView } from "@/lib/products/cashflow-ai/gst/purchases-data";
import { buildPurchasesCsv } from "@/lib/products/cashflow-ai/gst/purchases-csv";

type Result = { ok: true } | { ok: false; error: string };

// Checked again here on every call: the page hiding a control is not the boundary.
export async function saveDecisionAction(billId: unknown, decision: unknown, note: unknown): Promise<Result> {
  const user = await getCurrentFmsUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!canManageCompliance(user)) return { ok: false, error: "You do not have permission to change input-credit decisions." };
  if (typeof billId !== "string" || !billId || billId.length > 100) return { ok: false, error: "Bill not found." };
  if (typeof decision !== "string") return { ok: false, error: "Choose one of the listed decisions." };
  if (note != null && typeof note !== "string") return { ok: false, error: "The note must be text." };
  if (typeof note === "string" && note.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  const res = await saveItcDecision({ billId, decision, note }, { id: user.id, email: user.email });
  if (res.ok) revalidatePath("/cashflow-ai/gst", "layout");
  return res;
}

export async function exportPurchasesCsvAction(month: unknown): Promise<{ ok: true; filename: string; csv: string } | { ok: false; error: string }> {
  const user = await getCurrentFmsUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!canViewFinancialStatements(user)) return { ok: false, error: "You do not have permission to download this." };
  if (typeof month !== "string" || !isMonth(month)) return { ok: false, error: "Choose a valid month." };
  const { rows, notes } = await loadPurchasesView(month);
  return { ok: true, filename: `purchases-${month}.csv`, csv: buildPurchasesCsv(rows, notes) };
}
