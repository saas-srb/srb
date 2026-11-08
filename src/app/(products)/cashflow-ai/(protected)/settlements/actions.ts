"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canReconcile } from "@/lib/fms-roles";
import { bookSettlement, syncSettlements } from "@/lib/products/cashflow-ai/payments/settlements";

async function reconciler() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canReconcile(user)) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}

function refresh() {
  revalidatePath("/cashflow-ai/settlements");
  revalidatePath("/cashflow-ai/transfers");
  revalidatePath("/cashflow-ai/compliance", "layout");
}

export async function syncSettlementsAction(from: string, to: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const actor = await reconciler();
  const r = await syncSettlements({ from, to }, actor);
  if (!r.ok) return r;
  refresh();
  return {
    ok: true,
    message: r.settlements === 0 ? "Razorpay has no settlement in these dates." : `${r.settlements} settlement${r.settlements === 1 ? "" : "s"} read (${r.new} new): ${r.ready} ready to book, ${r.review} need review.${r.rejectedRows ? ` ${r.rejectedRows} unreadable rows were skipped.` : ""}`,
  };
}

export async function bookSettlementAction(id: string, bankAccountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await reconciler();
  const r = await bookSettlement(id, bankAccountId, actor);
  if (r.ok) refresh();
  return r;
}
