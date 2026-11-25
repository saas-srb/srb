import "server-only";
import { resolveSettings, settingsPatch } from "@/lib/platform/defaults/product/company";
import { rateId } from "@/lib/platform/defaults/product/model";
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

// Fixed ids: a company that never saved the list reads it without it being written, so the ids must be the same every time.
const DEFAULT_RATES: TaxRate[] = ([["GST 18%", 18], ["GST 12%", 12], ["GST 5%", 5], ["No Tax", 0]] as const).map(([name, ratePercent]) => ({ id: rateId(name), name, ratePercent, isActive: true }));

const codeDefaults = (): TaxConfig => ({ _id: TAX_CONFIG_ID, rates: DEFAULT_RATES, updatedAt: new Date(0), updatedBy: null });

/** Nothing is written by reading: a company that never saved the list follows the platform's default, else the code default. */
export async function getTaxConfig(): Promise<TaxConfig> {
  const db = await getDb();
  const doc = await db.collection<TaxConfig>(TAX_CONFIG_COLLECTION).findOne({ _id: TAX_CONFIG_ID });
  return resolveSettings("cashflow-ai", TAX_CONFIG_COLLECTION, { ...codeDefaults(), ...(doc ?? {}) }, doc);
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
  const before = await collection.findOne({ _id: TAX_CONFIG_ID });
  const set = await settingsPatch("cashflow-ai", TAX_CONFIG_COLLECTION, before, { rates: withIds }, codeDefaults());
  await collection.updateOne({ _id: TAX_CONFIG_ID }, { $set: { ...set, ...updateStamp(actorId) } }, { upsert: true });
  return getTaxConfig();
}
