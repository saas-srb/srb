import "server-only";
import { getDb } from "@/lib/mongodb";
import { round2 } from "@/lib/products/cashflow-ai/constants";

/**
 * Tax Report (§25 — Phase 7): real tax collected/paid from settled
 * `fms_transactions.taxAmount` — replacing `fms/dashboard.ts`'s previously
 * hardcoded `taxPayable: 0`. Not a GST-component breakdown (CGST/SGST/
 * IGST) — FMS's own `taxAmount` is a single flat figure per transaction
 * (see `fms/pricing.ts`), same scope limit as the rest of Phase 7's tax work.
 */

const TRANSACTIONS_COLLECTION = "fms_transactions";
const SETTLED_STATUSES = ["completed", "reconciled"];

interface Doc {
  _id: string;
}

async function taxSum(type: "income" | "expense", match: Record<string, unknown>): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db
      .collection<Doc>(TRANSACTIONS_COLLECTION)
      .aggregate<{ total: number }>([
        { $match: { deletedAt: null, type, status: { $in: SETTLED_STATUSES }, taxAmount: { $gt: 0 }, ...match } },
        { $group: { _id: null, total: { $sum: "$taxAmount" } } },
      ])
      .toArray();
    return round2(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

export interface TaxSummary {
  dateFrom: string | null;
  dateTo: string | null;
  taxCollected: number;
  taxPaid: number;
  netPayable: number;
}

export async function getTaxSummary(opts: { dateFrom?: Date; dateTo?: Date } = {}): Promise<TaxSummary> {
  const range: Record<string, unknown> = {};
  if (opts.dateFrom || opts.dateTo) {
    const r: Record<string, Date> = {};
    if (opts.dateFrom) r.$gte = opts.dateFrom;
    if (opts.dateTo) r.$lte = opts.dateTo;
    range.transactionDate = r;
  }
  const [taxCollected, taxPaid] = await Promise.all([taxSum("income", range), taxSum("expense", range)]);
  return {
    dateFrom: opts.dateFrom ? opts.dateFrom.toISOString() : null,
    dateTo: opts.dateTo ? opts.dateTo.toISOString() : null,
    taxCollected,
    taxPaid,
    netPayable: round2(taxCollected - taxPaid),
  };
}

/** All-time net tax payable (collected − paid, since inception) — the FMS dashboard's Tax Payable KPI. */
export async function currentTaxPayable(): Promise<number> {
  const summary = await getTaxSummary();
  return summary.netPayable;
}
