import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/spendiq/db";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { getCompanyBrand } from "@/lib/platform/branding";

/**
 * PRMS-wide configuration (single document). Company identity used on Purchase
 * Order / invoice PDFs, requisition approval thresholds, default currency and
 * free-text category suggestions. Mirrors `src/lib/cohort-ai/settings.ts`.
 */

export const PRMS_SETTINGS_COLLECTION = "prms_settings";
const PRMS_SETTINGS_ID = "config";

export interface CompanyIdentity {
  name: string;
  addressLine: string | null;
  city: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
}

export interface PrmsSettings {
  _id: string;
  defaultCurrency: string;
  /**
   * Requisitions with an estimated cost at or above this value require a
   * second (procurement) approval level. Below it, a single manager approval
   * is enough.
   */
  procurementReviewThreshold: number;
  /** Requisitions at or above this value additionally notify finance on approval. */
  financeNotifyThreshold: number;
  /** Item-name / description autocomplete suggestions in the requisition form. */
  itemSuggestions: string[];
  company: CompanyIdentity;
  updatedAt: Date;
  updatedBy: string | null;
}

const DEFAULT_COMPANY: CompanyIdentity = {
  name: "",
  addressLine: null,
  city: null,
  gstin: null,
  pan: null,
  email: null,
  phone: null,
  website: null,
  signatoryName: null,
  signatoryTitle: "Procurement Head",
};

/**
 * Defaults for a company that hasn't saved its company identity yet: the
 * its own name with blank details.
 */
async function defaultCompanyIdentity(): Promise<CompanyIdentity> {
  return { ...DEFAULT_COMPANY, name: (await getCompanyBrand()).name, website: null };
}

const DEFAULTS: Omit<PrmsSettings, "_id" | "updatedAt" | "updatedBy"> = {
  defaultCurrency: DEFAULT_CURRENCY,
  procurementReviewThreshold: 50000,
  financeNotifyThreshold: 200000,
  itemSuggestions: [],
  company: DEFAULT_COMPANY,
};

export async function getPrmsSettings(): Promise<PrmsSettings> {
  const db = await getDb();
  const collection = db.collection<PrmsSettings>(PRMS_SETTINGS_COLLECTION);
  const existing = await collection.findOne({ _id: PRMS_SETTINGS_ID });
  const base = await defaultCompanyIdentity();
  if (existing) return { ...DEFAULTS, ...existing, company: { ...base, ...existing.company, name: existing.company?.name || base.name } };

  const doc: PrmsSettings = { _id: PRMS_SETTINGS_ID, ...DEFAULTS, company: base, updatedAt: new Date(), updatedBy: null };
  await collection.updateOne({ _id: PRMS_SETTINGS_ID }, { $setOnInsert: doc }, { upsert: true });
  return doc;
}

export interface PrmsSettingsInput {
  defaultCurrency: string;
  procurementReviewThreshold: number;
  financeNotifyThreshold: number;
  itemSuggestions: string[];
  company: CompanyIdentity;
}

export function normalizeSettingsInput(input: Record<string, unknown>): PrmsSettingsInput {
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean))).slice(0, 200)
      : String(v ?? "")
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s, i, a) => a.indexOf(s) === i)
          .slice(0, 200);

  const optStr = (v: unknown, max = 300): string | null => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };

  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  };

  const currency = String(input.defaultCurrency ?? DEFAULT_CURRENCY).toUpperCase();

  return {
    defaultCurrency: (SUPPORTED_CURRENCIES as readonly string[]).includes(currency) ? currency : DEFAULT_CURRENCY,
    procurementReviewThreshold: num(input.procurementReviewThreshold, DEFAULTS.procurementReviewThreshold),
    financeNotifyThreshold: num(input.financeNotifyThreshold, DEFAULTS.financeNotifyThreshold),
    itemSuggestions: list(input.itemSuggestions),
    company: {
      name: optStr(input.companyName, 160) ?? "",
      addressLine: optStr(input.companyAddress),
      city: optStr(input.companyCity, 120),
      gstin: optStr(input.companyGstin, 20)?.toUpperCase() ?? null,
      pan: optStr(input.companyPan, 10)?.toUpperCase() ?? null,
      email: optStr(input.companyEmail, 160),
      phone: optStr(input.companyPhone, 40),
      website: optStr(input.companyWebsite, 200),
      signatoryName: optStr(input.signatoryName, 160),
      signatoryTitle: optStr(input.signatoryTitle, 160),
    },
  };
}

export async function updatePrmsSettings(data: PrmsSettingsInput, actorId: string): Promise<PrmsSettings> {
  const db = await getDb();
  const collection = db.collection<PrmsSettings>(PRMS_SETTINGS_COLLECTION);
  const result = await collection.findOneAndUpdate(
    { _id: PRMS_SETTINGS_ID },
    { $set: { ...data, ...updateStamp(actorId) } },
    { upsert: true, returnDocument: "after" }
  );
  return { ...DEFAULTS, ...(result as PrmsSettings) };
}
