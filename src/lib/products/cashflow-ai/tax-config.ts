import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, updateStamp } from "@/lib/products/cashflow-ai/db";

/**
 * Tax-rate configuration (§25 — Phase 7), single doc, mirrors
 * `hrms/payroll-config.ts`'s shape exactly. No central tax-rate table
 * existed anywhere in the platform before this — PRMS's `GST_RATES` are
 * hardcoded constants, not admin-editable. Deliberately NOT a GST/TDS
 * compliance engine (CGST/SGST/IGST split, HSN codes, TDS) — that's PRMS's
 * own procurement-specific territory; this is just a named rate list so
 * FMS's own `taxAmount` fields aren't always hand-typed.
 */

export const TAX_CONFIG_COLLECTION = "fms_tax_config";
const TAX_CONFIG_ID = "org";

export interface TaxRate {
  id: string;
  name: string;
  ratePercent: number;
  isActive: boolean;
}

export interface TaxConfig {
  _id: string;
  rates: TaxRate[];
  updatedAt: Date;
  updatedBy: string | null;
}

export interface SerializedTaxConfig extends Omit<TaxConfig, "updatedAt"> {
  updatedAt: string;
}

export function serializeTaxConfig(c: TaxConfig): SerializedTaxConfig {
  return { ...c, updatedAt: c.updatedAt.toISOString() };
}

const DEFAULT_RATES: TaxRate[] = [
  { id: newId(), name: "GST 18%", ratePercent: 18, isActive: true },
  { id: newId(), name: "GST 12%", ratePercent: 12, isActive: true },
  { id: newId(), name: "GST 5%", ratePercent: 5, isActive: true },
  { id: newId(), name: "No Tax", ratePercent: 0, isActive: true },
];

export async function getTaxConfig(): Promise<TaxConfig> {
  const db = await getDb();
  const collection = db.collection<TaxConfig>(TAX_CONFIG_COLLECTION);
  const existing = await collection.findOne({ _id: TAX_CONFIG_ID });
  if (existing) return existing;
  const doc: TaxConfig = { _id: TAX_CONFIG_ID, rates: DEFAULT_RATES, updatedAt: new Date(), updatedBy: null };
  await collection.updateOne({ _id: TAX_CONFIG_ID }, { $setOnInsert: doc }, { upsert: true });
  return doc;
}

export async function updateTaxConfig(rates: (Omit<TaxRate, "id"> & { id?: string })[], actorId: string): Promise<TaxConfig> {
  const db = await getDb();
  const collection = db.collection<TaxConfig>(TAX_CONFIG_COLLECTION);
  const withIds: TaxRate[] = rates.map((r) => ({
    id: r.id ?? newId(),
    name: r.name,
    ratePercent: r.ratePercent,
    isActive: r.isActive,
  }));
  const result = await collection.findOneAndUpdate(
    { _id: TAX_CONFIG_ID },
    { $set: { rates: withIds, ...updateStamp(actorId) } },
    { upsert: true, returnDocument: "after" }
  );
  return result as TaxConfig;
}
