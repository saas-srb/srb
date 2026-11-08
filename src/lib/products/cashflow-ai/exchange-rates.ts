import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { DEFAULT_CURRENCY, round2 } from "@/lib/products/cashflow-ai/constants";

/**
 * Exchange rates to the base currency (§51 Phase 7). Closes a real, latent
 * bug: every FMS report (`fms/reports/*.ts`) sums journal-line amounts with
 * no currency awareness — a USD and an INR transaction posting to the same
 * account would silently sum ₹ and $ face values together. This module is
 * the fail-soft fix: a currency with no configured rate converts at `1.0`
 * (never throws, never crashes a report), but callers get told via
 * `configured: false` so the UI can warn rather than silently mis-state a
 * total. Deliberately NOT a live FX feed — an admin enters rates by hand,
 * same manual-entry posture as every other FMS config in this platform.
 */

export const EXCHANGE_RATES_COLLECTION = "fms_exchange_rates";

export interface ExchangeRate extends AuditFields {
  _id: string;
  /** Never the base currency itself — the base always converts at exactly 1. */
  currency: string;
  /** 1 unit of `currency` = this many units of `DEFAULT_CURRENCY`. */
  rateToBase: number;
  effectiveDate: Date;
}

export interface SerializedExchangeRate extends Omit<ExchangeRate, "createdAt" | "updatedAt" | "deletedAt" | "effectiveDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  effectiveDate: string;
}

export function serializeExchangeRate(r: ExchangeRate): SerializedExchangeRate {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    effectiveDate: r.effectiveDate.toISOString(),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ExchangeRate>(EXCHANGE_RATES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([collection.createIndex({ currency: 1, effectiveDate: -1 }).catch(() => {})]);
  }
  return collection;
}

export async function listExchangeRates(): Promise<ExchangeRate[]> {
  const collection = await getCollection();
  return collection.find(notDeleted).sort({ currency: 1, effectiveDate: -1 }).toArray();
}

export interface ExchangeRateWriteData {
  currency: string;
  rateToBase: number;
  effectiveDate: Date;
}

/** Every rate entry is dated history, never overwritten — `rateFor` picks the latest one at/before a date. */
export async function addExchangeRate(data: ExchangeRateWriteData, actorId: string): Promise<ExchangeRate> {
  const collection = await getCollection();
  const doc: ExchangeRate = {
    _id: newId(),
    currency: data.currency.toUpperCase(),
    rateToBase: round2(data.rateToBase),
    effectiveDate: data.effectiveDate,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function deleteExchangeRate(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

export interface RateLookup {
  rate: number;
  /** false when this is the `1.0` fail-soft fallback for an unconfigured non-base currency. */
  configured: boolean;
}

export async function rateFor(currency: string, asOf: Date = new Date()): Promise<RateLookup> {
  if (currency === DEFAULT_CURRENCY) return { rate: 1, configured: true };
  try {
    const collection = await getCollection();
    const rows = await collection
      .find({ currency, effectiveDate: { $lte: asOf }, ...notDeleted })
      .sort({ effectiveDate: -1 })
      .limit(1)
      .toArray();
    if (rows.length === 0) return { rate: 1, configured: false };
    return { rate: rows[0].rateToBase, configured: true };
  } catch {
    return { rate: 1, configured: false };
  }
}

/** Batches rate lookups by distinct currency (one lookup per currency, not per line). */
export async function convertLinesToBase<T extends { amount: number; currency: string }>(
  lines: T[],
  asOf: Date = new Date()
): Promise<{ lines: (T & { baseAmount: number })[]; hasUnratedForeignCurrency: boolean }> {
  const currencies = Array.from(new Set(lines.map((l) => l.currency)));
  const rates = new Map<string, RateLookup>();
  await Promise.all(currencies.map(async (c) => rates.set(c, await rateFor(c, asOf))));

  let hasUnratedForeignCurrency = false;
  const converted = lines.map((l) => {
    const r = rates.get(l.currency) ?? { rate: 1, configured: l.currency === DEFAULT_CURRENCY };
    if (!r.configured) hasUnratedForeignCurrency = true;
    return { ...l, baseAmount: round2(l.amount * r.rate) };
  });
  return { lines: converted, hasUnratedForeignCurrency };
}
