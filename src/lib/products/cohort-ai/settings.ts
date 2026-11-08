import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/cohort-ai/db";
import {
  DEFAULT_PROGRAM_TECHNOLOGIES,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  DEFAULT_CERTIFICATE_NUMBER_FORMAT,
} from "@/lib/products/cohort-ai/constants";
import { getCompanyBrand } from "@/lib/platform/branding";

/**
 * TMS-wide configuration (single document). Editable program categories,
 * technology suggestions, default currency, certificate numbering and the
 * institute identity used on certificates and invoices.
 * Mirrors `src/lib/sprintos/settings.ts`.
 */

export const TMS_SETTINGS_COLLECTION = "training_settings";
const TMS_SETTINGS_ID = "config";

export interface InstituteIdentity {
  name: string;
  addressLine: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
}

export interface TmsSettings {
  _id: string;
  /** Free-text program-track suggestions offered in the program form. */
  technologySuggestions: string[];
  defaultCurrency: string;
  /** `{n}` padded sequence, `{yyyy}` year. */
  certificateNumberFormat: string;
  /** Default class duration in minutes. */
  defaultClassDurationMinutes: number;
  institute: InstituteIdentity;
  updatedAt: Date;
  updatedBy: string | null;
}

const DEFAULT_INSTITUTE: InstituteIdentity = {
  name: "",
  addressLine: null,
  city: null,
  email: null,
  phone: null,
  website: null,
  signatoryName: null,
  signatoryTitle: "Training Head",
};

/**
 * Defaults for a company that hasn't saved its institute identity yet: the
 * its own name with blank details.
 */
async function defaultInstituteIdentity(): Promise<InstituteIdentity> {
  return { ...DEFAULT_INSTITUTE, name: (await getCompanyBrand()).name, website: null };
}

const DEFAULTS: Omit<TmsSettings, "_id" | "updatedAt" | "updatedBy"> = {
  technologySuggestions: [...DEFAULT_PROGRAM_TECHNOLOGIES],
  defaultCurrency: DEFAULT_CURRENCY,
  certificateNumberFormat: DEFAULT_CERTIFICATE_NUMBER_FORMAT,
  defaultClassDurationMinutes: 90,
  institute: DEFAULT_INSTITUTE,
};

export async function getTmsSettings(): Promise<TmsSettings> {
  const db = await getDb();
  const collection = db.collection<TmsSettings>(TMS_SETTINGS_COLLECTION);
  const existing = await collection.findOne({ _id: TMS_SETTINGS_ID });
  const base = await defaultInstituteIdentity();
  if (existing) return { ...DEFAULTS, ...existing, institute: { ...base, ...existing.institute, name: existing.institute?.name || base.name } };

  const doc: TmsSettings = { _id: TMS_SETTINGS_ID, ...DEFAULTS, institute: base, updatedAt: new Date(), updatedBy: null };
  await collection.updateOne({ _id: TMS_SETTINGS_ID }, { $setOnInsert: doc }, { upsert: true });
  return doc;
}

export interface TmsSettingsInput {
  technologySuggestions: string[];
  defaultCurrency: string;
  certificateNumberFormat: string;
  defaultClassDurationMinutes: number;
  institute: InstituteIdentity;
}

export function normalizeSettingsInput(input: Record<string, unknown>): TmsSettingsInput {
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean))).slice(0, 100)
      : String(v ?? "")
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s, i, a) => a.indexOf(s) === i)
          .slice(0, 100);

  const optStr = (v: unknown, max = 300): string | null => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };

  const currency = String(input.defaultCurrency ?? DEFAULT_CURRENCY).toUpperCase();
  const durationRaw = Number(input.defaultClassDurationMinutes);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(Math.round(durationRaw), 600) : 90;
  const format = String(input.certificateNumberFormat ?? DEFAULT_CERTIFICATE_NUMBER_FORMAT).trim().slice(0, 80) ||
    DEFAULT_CERTIFICATE_NUMBER_FORMAT;

  return {
    technologySuggestions: list(input.technologySuggestions),
    defaultCurrency: (SUPPORTED_CURRENCIES as readonly string[]).includes(currency) ? currency : DEFAULT_CURRENCY,
    certificateNumberFormat: /\{n\}/.test(format) ? format : DEFAULT_CERTIFICATE_NUMBER_FORMAT,
    defaultClassDurationMinutes: duration,
    institute: {
      name: optStr(input.instituteName, 160) ?? "",
      addressLine: optStr(input.instituteAddress),
      city: optStr(input.instituteCity, 120),
      email: optStr(input.instituteEmail, 160),
      phone: optStr(input.institutePhone, 40),
      website: optStr(input.instituteWebsite, 200),
      signatoryName: optStr(input.signatoryName, 160),
      signatoryTitle: optStr(input.signatoryTitle, 160),
    },
  };
}

export async function updateTmsSettings(data: TmsSettingsInput, actorId: string): Promise<TmsSettings> {
  const db = await getDb();
  const collection = db.collection<TmsSettings>(TMS_SETTINGS_COLLECTION);
  const result = await collection.findOneAndUpdate(
    { _id: TMS_SETTINGS_ID },
    { $set: { ...data, ...updateStamp(actorId) } },
    { upsert: true, returnDocument: "after" }
  );
  return { ...DEFAULTS, ...(result as TmsSettings) };
}
