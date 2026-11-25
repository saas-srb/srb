import "server-only";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-access";
import { hiddenProducts } from "@/lib/platform/products/visible";

/**
 * Whether CashFlow is where this company keeps these records: it doesn't have the product that normally does ("prms" =
 * vendors and bills, "pms" = clients). `manage` = this person may add and change them here.
 */
export async function cashflowKeeps(owner: "prms" | "pms"): Promise<{ here: boolean; manage: boolean }> {
  const here = (await hiddenProducts()).has(owner);
  if (!here) return { here, manage: false };
  const user = await getCurrentFmsUser();
  return { here, manage: Boolean(user && canManageTransactions(user)) };
}
