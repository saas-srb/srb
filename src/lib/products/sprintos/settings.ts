import "server-only";
import { resolveSettings, settingsPatch } from "@/lib/platform/defaults/product/company";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/sprintos/db";
import { DEFAULT_PROJECT_CATEGORIES, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/products/sprintos/constants";

/**
 * PMS-wide configuration (single document). Editable project categories,
 * technology suggestions and the default currency for new projects.
 * Mirrors `src/lib/talentos/settings.ts`.
 */

export const PMS_SETTINGS_COLLECTION = "pms_settings";
const PMS_SETTINGS_ID = "config";

export interface PmsSettings {
  _id: string;
  categories: string[];
  /** Free-text technology-stack suggestions offered in the project form. */
  technologySuggestions: string[];
  defaultCurrency: string;
  updatedAt: Date;
  updatedBy: string | null;
}

const DEFAULT_TECH_SUGGESTIONS = [
  "Next.js", "React", "TypeScript", "Node.js", "Python", "PostgreSQL", "MongoDB",
  "Tailwind CSS", "AWS", "Docker", "Kubernetes", "React Native", "Flutter", "FastAPI",
  "TensorFlow", "PyTorch", "Redis", "GraphQL",
];

const DEFAULTS: Omit<PmsSettings, "_id" | "updatedAt" | "updatedBy"> = {
  categories: [...DEFAULT_PROJECT_CATEGORIES],
  technologySuggestions: DEFAULT_TECH_SUGGESTIONS,
  defaultCurrency: DEFAULT_CURRENCY,
};

/** Nothing is written by reading: a field the company never saved follows the platform's default, else the code default. */
export async function getPmsSettings(): Promise<PmsSettings> {
  const db = await getDb();
  const doc = await db.collection<PmsSettings>(PMS_SETTINGS_COLLECTION).findOne({ _id: PMS_SETTINGS_ID });
  return resolveSettings("sprintos", PMS_SETTINGS_COLLECTION, { ...codeDefaults(), ...(doc ?? {}) }, doc);
}

const codeDefaults = (): PmsSettings => ({ _id: PMS_SETTINGS_ID, ...DEFAULTS, updatedAt: new Date(0), updatedBy: null });

export interface PmsSettingsInput {
  categories: string[];
  technologySuggestions: string[];
  defaultCurrency: string;
}

export function normalizeSettingsInput(input: Record<string, unknown>): PmsSettingsInput {
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean))).slice(0, 100)
      : String(v ?? "")
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s, i, a) => a.indexOf(s) === i)
          .slice(0, 100);

  const currency = String(input.defaultCurrency ?? DEFAULT_CURRENCY).toUpperCase();
  return {
    categories: list(input.categories).length > 0 ? list(input.categories) : [...DEFAULT_PROJECT_CATEGORIES],
    technologySuggestions: list(input.technologySuggestions),
    defaultCurrency: (SUPPORTED_CURRENCIES as readonly string[]).includes(currency) ? currency : DEFAULT_CURRENCY,
  };
}

export async function updatePmsSettings(data: PmsSettingsInput, actorId: string): Promise<PmsSettings> {
  const db = await getDb();
  const collection = db.collection<PmsSettings>(PMS_SETTINGS_COLLECTION);
  const before = await collection.findOne({ _id: PMS_SETTINGS_ID });
  const set = await settingsPatch("sprintos", PMS_SETTINGS_COLLECTION, before, data, codeDefaults());
  await collection.updateOne({ _id: PMS_SETTINGS_ID }, { $set: { ...set, ...updateStamp(actorId) } }, { upsert: true });
  return getPmsSettings();
}
