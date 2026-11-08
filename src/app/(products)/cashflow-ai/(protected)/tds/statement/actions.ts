"use server";

import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canViewFinancialStatements } from "@/lib/fms-roles";
import { isFinancialYear, isQuarter } from "@/lib/products/cashflow-ai/tds/core";
import { loadDeductions } from "@/lib/products/cashflow-ai/tds/store";
import { statementLines } from "@/lib/products/cashflow-ai/tds/statement";
import { statementCsv } from "@/lib/products/cashflow-ai/tds/statement-csv";

export type StatementCsvResult = { ok: true; filename: string; csv: string } | { ok: false; error: string };

// A server action instead of a route (one function fewer to deploy). The permission is checked again here: the page guard does not
// protect an action that is called directly.
export async function downloadStatementCsvAction(fy: unknown, quarter: unknown): Promise<StatementCsvResult> {
  const user = await getCurrentFmsUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!canViewFinancialStatements(user)) return { ok: false, error: "You do not have access to TDS working." };
  if (typeof fy !== "string" || !isFinancialYear(fy)) return { ok: false, error: "Choose a financial year." };
  if (typeof quarter !== "number" || !isQuarter(quarter)) return { ok: false, error: "Choose a quarter." };
  const { rows } = await loadDeductions(fy, quarter);
  return { ok: true, filename: `tds-statement-${fy}-q${quarter}.csv`, csv: statementCsv(statementLines(rows), fy, quarter) };
}
