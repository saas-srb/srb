import "server-only";
import { listCashAccounts } from "@/lib/products/cashflow-ai/cash-accounts";

/** Whether the company keeps any cash box: the weekly cash count applies only then. */
export async function cashFlowAccountsExist(): Promise<boolean> {
  try {
    return (await listCashAccounts()).length > 0;
  } catch {
    return false;
  }
}
