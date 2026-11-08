import { getPrompt } from "@/lib/prompts/store";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, updateStamp, str } from "@/lib/products/agentos/db";
import { DEFAULT_MODELS, type ModelPrice } from "@/lib/products/agentos/constants";
import { AibotsInputError } from "@/lib/products/agentos/viewer";

/** Single settings document (`aibots_settings` / `_id: "main"`). */

export interface AibotsSettings {
  _id: string;
  /** OpenAI models a bot may be configured with, plus the per-1M-token prices used for cost estimates. */
  models: ModelPrice[];
  defaultModel: string;
  /** Max prior turns of a conversation sent to the model is managed by OpenAI; this caps output per reply. */
  maxOutputTokens: number;
  /** Per-user daily message cap across all bots (0 = unlimited). */
  dailyMessageLimit: number;
  /** System instructions for "Start New Chat" — the general assistant that isn't tied to any bot. Uses `defaultModel`. */
  generalInstructions: string;
  updatedAt: Date;
  updatedBy: string | null;
}

const ID = "main";
export const DEFAULT_SETTINGS = { models: DEFAULT_MODELS, defaultModel: DEFAULT_MODELS[0].id, maxOutputTokens: 4000, dailyMessageLimit: 200, generalInstructions: "" };

export async function getSettings(): Promise<AibotsSettings> {
  const db = await getDb();
  const doc = await db.collection<AibotsSettings>(COLLECTIONS.settings).findOne({ _id: ID });
  const merged = { _id: ID, ...DEFAULT_SETTINGS, updatedAt: new Date(0), updatedBy: null, ...(doc ?? {}) };
  if (!merged.models?.length) merged.models = DEFAULT_MODELS;
  // Left empty, a company uses the platform's general-assistant prompt (Platform Console → AI prompts).
  if (!merged.generalInstructions?.trim()) merged.generalInstructions = await getPrompt("agentos.general.default");
  return merged;
}

export function priceFor(settings: AibotsSettings, model: string): ModelPrice | null {
  return settings.models.find((m) => m.id === model) ?? null;
}

/** USD estimate for one execution. Unknown models cost 0 (shown as "—" in the UI). */
export function estimateCost(settings: AibotsSettings, model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(settings, model);
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,63}$/;

export async function saveSettings(
  input: { models: { id: unknown; label: unknown; input: unknown; output: unknown }[]; defaultModel: unknown; maxOutputTokens: unknown; dailyMessageLimit: unknown; generalInstructions: unknown },
  actorId: string
): Promise<void> {
  const seen = new Set<string>();
  const models: ModelPrice[] = [];
  for (const m of input.models.slice(0, 40)) {
    const id = str(m.id, 64);
    if (!id) continue;
    if (!MODEL_ID.test(id)) throw new AibotsInputError(`"${id}" isn't a valid OpenAI model id.`);
    if (seen.has(id)) continue;
    seen.add(id);
    const num = (v: unknown) => Math.min(Math.max(Number(v) || 0, 0), 1000);
    models.push({ id, label: str(m.label, 60) || id, input: num(m.input), output: num(m.output) });
  }
  if (models.length === 0) throw new AibotsInputError("Keep at least one model.");
  const defaultModel = str(input.defaultModel, 64);
  const maxOutputTokens = Math.min(Math.max(Math.round(Number(input.maxOutputTokens) || 0), 256), 32000);
  const dailyMessageLimit = Math.min(Math.max(Math.round(Number(input.dailyMessageLimit) || 0), 0), 10000);
  const db = await getDb();
  await db.collection<AibotsSettings>(COLLECTIONS.settings).updateOne(
    { _id: ID },
    {
      $set: {
        models,
        defaultModel: seen.has(defaultModel) ? defaultModel : models[0].id,
        maxOutputTokens,
        dailyMessageLimit,
        generalInstructions: str(input.generalInstructions, 20000) || (await getPrompt("agentos.general.default")),
        ...updateStamp(actorId),
      },
    },
    { upsert: true }
  );
}
