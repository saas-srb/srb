import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, str, strList, updateStamp } from "@/lib/products/viralpulse-ai/db";
import { DEFAULT_MODELS } from "@/lib/products/agentos/constants";
import type { ModelPrice } from "@/lib/products/viralpulse-ai/constants";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, isImageQuality, type ImageQuality, type ImagePriceTable, type ImageSizeKey, IMAGE_QUALITIES } from "@/lib/products/viralpulse-ai/models";
import { checkLinkedinVersion } from "@/lib/products/viralpulse-ai/linkedin-version";

/**
 * Single settings document (`smms_settings` / `_id: "main"`): the brand
 * context the AI writes from, and the OpenAI configuration.
 *
 * The brand context holds ONLY marketing voice that no other product owns (tone,
 * messaging, audience, selling points…). Company name / website / contact are
 * read live from HRMS company details, services from the site catalogue and
 * offers from Festival Offers — see `brand.ts`.
 */

export interface BrandContext {
  about: string;
  /** Services from the site catalogue (labels) and/or free text. */
  services: string[];
  products: string[];
  tone: string;
  targetAudience: string;
  messaging: string;
  websiteInfo: string;
  sellingPoints: string[];
  /** Words, claims or topics the AI must avoid. */
  avoid: string[];
  /** Branded hashtags added to suggestions where the platform uses hashtags. */
  brandHashtags: string[];
  /** Feed currently active Festival Offers into generation. */
  includeOffers: boolean;
}

export interface AiSettings {
  textModel: string;
  imageModel: string;
  imageQuality: ImageQuality;
  /** null = model default (reasoning models reject temperature). */
  temperature: number | null;
  maxOutputTokens: number;
  /** Per-user AI generations per day (0 = unlimited). */
  dailyGenerationLimit: number;
  /** Last-resort USD per image, used only when the API reports no token usage AND the price table has no cell. 0 = none. */
  imageCostUsd: number;
  /** Optional per-image price overrides (quality -> size -> USD); see `IMAGE_FALLBACK_PRICES` for the documented defaults. */
  imagePrices?: ImagePriceTable;
  /** Text-model price table used for cost estimates (shared defaults with AI Bots). */
  models: ModelPrice[];
}

export interface SmmsSettings {
  _id: string;
  brand: BrandContext;
  ai: AiSettings;
  /** LinkedIn-Version header override (YYYYMM); empty = the verified default / LINKEDIN_API_VERSION env. */
  linkedinVersion?: string;
  updatedAt: Date;
  updatedBy: string | null;
}

const ID = "main";

export const DEFAULT_BRAND: BrandContext = {
  about: "",
  services: [],
  products: [],
  tone: "Professional, confident and approachable",
  targetAudience: "",
  messaging: "",
  websiteInfo: "",
  sellingPoints: [],
  avoid: [],
  brandHashtags: [],
  includeOffers: true,
};

/**
 * Text-model prices (USD per 1M tokens) for the usage ledger, from developers.openai.com/api/docs/pricing (2026-11-01), followed by the
 * shared AI Bots list for older models that companies may still have selected.
 */
export const VIRALPULSE_TEXT_MODELS: ModelPrice[] = [
  { id: "gpt-6-luna", label: "GPT-6 Luna", input: 0.1, output: 0.5 },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", input: 1, output: 5 },
  ...DEFAULT_MODELS,
];

export const DEFAULT_AI: AiSettings = {
  textModel: DEFAULT_TEXT_MODEL,
  imageModel: DEFAULT_IMAGE_MODEL,
  imageQuality: "medium",
  temperature: 0.8,
  maxOutputTokens: 6000,
  dailyGenerationLimit: 150,
  imageCostUsd: 0,
  models: VIRALPULSE_TEXT_MODELS,
};

export async function getSettings(): Promise<SmmsSettings> {
  const db = await getDb();
  const doc = await db.collection<SmmsSettings>(COLLECTIONS.settings).findOne({ _id: ID });
  return {
    _id: ID,
    brand: { ...DEFAULT_BRAND, ...(doc?.brand ?? {}) },
    ai: { ...DEFAULT_AI, ...(doc?.ai ?? {}), models: mergeModels(doc?.ai?.models) },
    linkedinVersion: doc?.linkedinVersion,
    updatedAt: doc?.updatedAt ?? new Date(0),
    updatedBy: doc?.updatedBy ?? null,
  };
}

/** The saved price list plus any default model it lacks (so newly added models are never costed at 0). */
export function mergeModels(saved: ModelPrice[] | undefined): ModelPrice[] {
  const list = saved?.length ? [...saved] : [];
  for (const m of VIRALPULSE_TEXT_MODELS) if (!list.some((x) => x.id === m.id)) list.push(m);
  return list;
}

/** USD estimate for one text generation. Unknown models cost 0. */
export function estimateCost(ai: AiSettings, model: string, inputTokens: number, outputTokens: number): number {
  const p = ai.models.find((m) => m.id === model);
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,63}$/;

export async function saveBrand(input: Record<string, unknown>, actorId: string): Promise<BrandContext> {
  const brand: BrandContext = {
    about: str(input.about, 3000),
    services: strList(input.services, 40, 120),
    products: strList(input.products, 40, 160),
    tone: str(input.tone, 300),
    targetAudience: str(input.targetAudience, 1500),
    messaging: str(input.messaging, 2000),
    websiteInfo: str(input.websiteInfo, 2000),
    sellingPoints: strList(input.sellingPoints, 20, 240),
    avoid: strList(input.avoid, 30, 120),
    brandHashtags: strList(input.brandHashtags, 10, 60).map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
    includeOffers: input.includeOffers !== false,
  };
  const db = await getDb();
  await db.collection<SmmsSettings>(COLLECTIONS.settings).updateOne({ _id: ID }, { $set: { brand, ...updateStamp(actorId) } }, { upsert: true });
  return brand;
}

export async function saveAi(input: Record<string, unknown>, actorId: string): Promise<AiSettings> {
  const current = await getSettings();
  const textModel = str(input.textModel, 64);
  const imageModel = str(input.imageModel, 64);
  if (!MODEL_ID.test(textModel)) throw new SmmsInputError("Enter a valid OpenAI text model id.");
  if (!MODEL_ID.test(imageModel)) throw new SmmsInputError("Enter a valid OpenAI image model id.");
  const quality: ImageQuality = isImageQuality(input.imageQuality) ? input.imageQuality : "medium";
  const t = input.temperature === null || input.temperature === "" ? null : Number(input.temperature);
  const ai: AiSettings = {
    ...current.ai,
    textModel,
    imageModel,
    imageQuality: quality,
    temperature: t === null || !Number.isFinite(t) ? null : Math.min(Math.max(t, 0), 2),
    maxOutputTokens: Math.min(Math.max(Math.round(Number(input.maxOutputTokens) || 0), 1000), 32000),
    dailyGenerationLimit: Math.min(Math.max(Math.round(Number(input.dailyGenerationLimit) || 0), 0), 5000),
    imageCostUsd: Math.min(Math.max(Number(input.imageCostUsd) || 0, 0), 5),
    ...(input.imagePrices !== undefined ? { imagePrices: cleanImagePrices(input.imagePrices) } : {}),
  };
  const db = await getDb();
  await db.collection<SmmsSettings>(COLLECTIONS.settings).updateOne({ _id: ID }, { $set: { ai, ...updateStamp(actorId) } }, { upsert: true });
  return ai;
}

const SIZE_KEYS: ImageSizeKey[] = ["1024x1024", "1024x1536", "1536x1024"];

function cleanImagePrices(raw: unknown): ImagePriceTable {
  const out: ImagePriceTable = {};
  if (!raw || typeof raw !== "object") return out;
  for (const q of IMAGE_QUALITIES) {
    const row = (raw as Record<string, unknown>)[q];
    if (!row || typeof row !== "object") continue;
    for (const k of SIZE_KEYS) {
      const n = Number((row as Record<string, unknown>)[k]);
      if (Number.isFinite(n) && n >= 0 && n <= 10 && (row as Record<string, unknown>)[k] !== "" && (row as Record<string, unknown>)[k] != null) (out[q] ??= {})[k] = n;
    }
  }
  return out;
}

/** Saves the LinkedIn API version override (YYYYMM). Empty clears it. Versions LinkedIn has already sunset are refused. */
export async function saveLinkedinVersion(version: string, actorId: string): Promise<string> {
  const v = version.trim();
  if (v) {
    const c = checkLinkedinVersion(v);
    if (c.state === "invalid") throw new SmmsInputError("Enter the LinkedIn version as YYYYMM, e.g. 202610.");
    if (c.state === "sunset") throw new SmmsInputError(c.message);
  }
  const db = await getDb();
  await db.collection<SmmsSettings>(COLLECTIONS.settings).updateOne({ _id: ID }, v ? { $set: { linkedinVersion: v, ...updateStamp(actorId) } } : { $unset: { linkedinVersion: "" }, $set: { ...updateStamp(actorId) } }, { upsert: true });
  return v;
}
