"use server";

import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canViewFinancialStatements } from "@/lib/fms-roles";
import { isMonth } from "@/lib/products/cashflow-ai/gst/core";
import { loadOutwardRows } from "@/lib/products/cashflow-ai/gst/store";
import { salesCsv } from "@/lib/products/cashflow-ai/gst/csv";

export type SalesCsvResult = { ok: true; filename: string; csv: string } | { ok: false; error: string };

// A server action instead of a route (one function fewer to deploy). The permission is checked again here: the page guard does not
// protect an action that is called directly.
export async function downloadSalesCsvAction(month: string): Promise<SalesCsvResult> {
  const user = await getCurrentFmsUser();
  if (!user || !canViewFinancialStatements(user)) return { ok: false, error: "You do not have access to GST working." };
  if (!isMonth(month)) return { ok: false, error: "Choose a month." };
  const rows = await loadOutwardRows(month);
  return { ok: true, filename: `sales-register-${month}.csv`, csv: salesCsv(rows) };
}
