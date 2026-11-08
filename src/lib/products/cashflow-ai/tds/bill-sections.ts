import "server-only";
import { getDb } from "@/lib/mongodb";
import { VENDORS_COLLECTION } from "@/lib/products/spendiq/vendors";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { financialYearOf, validPan } from "@/lib/products/cashflow-ai/tds/core";
import { sectionMap } from "@/lib/products/cashflow-ai/tds/store";

/** What the SpendIQ bill form needs about a TDS section: the rulebook's rate (and no-PAN rate) so choosing it fills the TDS %. */
export interface BillFormSection {
  code: string;
  label: string;
  rate: number | null;
  noPanRate: number | null;
  confirmed: boolean;
}

/** Sections offered on a new or edited bill: this year's rulebook less the ones the company does not use. */
export async function billFormSections(): Promise<BillFormSection[]> {
  const map = await sectionMap(financialYearOf(istToday()));
  return [...map.values()].filter((s) => s.active).map((s) => ({ code: s.code, label: s.label, rate: s.rate, noPanRate: s.noPanRate, confirmed: s.confirmed }));
}

/** Vendors with a valid PAN on file (by id), so the form can tell when the no-PAN rate applies. */
export async function vendorsWithPan(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = await getDb();
  const rows = (await db.collection(VENDORS_COLLECTION).find({ _id: { $in: ids as never[] } }, { projection: { pan: 1 } }).toArray()) as unknown as { _id: string; pan?: string | null }[];
  return new Set(rows.filter((v) => validPan(v.pan) !== null).map((v) => String(v._id)));
}
