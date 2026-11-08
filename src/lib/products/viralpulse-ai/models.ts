import "server-only";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
export * from "@/lib/products/viralpulse-ai/image-pricing-core";

/**
 * OpenAI model catalogue for ViralPulse: verified defaults, a runtime check against the company's own key (GET /v1/models),
 * graceful fallback when a configured model has been retired, and the image price table.
 *
 * Verified against OpenAI's official pages on 2026-11-01:
 *  - developers.openai.com/api/docs/deprecations: `gpt-image-1` shut down 2026-10-23; `gpt-image-1-mini`, `gpt-image-1.5` and
 *    `chatgpt-image-latest` shut down 2026-12-01; replacement for all: `gpt-image-2.5-sunburst` or `gpt-image-2.5-flare`.
 *    `gpt-4.1-mini-2025-04-14` shuts down 2027-01-14, replacement `gpt-6-luna`.
 *  - developers.openai.com/api/docs/models: current text models `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`;
 *    current image models GPT-Image-2.5 Sunburst / Flare.
 *  - developers.openai.com/api/docs/models/gpt-image-2.5-flare (and -sunburst), /pricing, /guides/image-generation: quality
 *    `low|medium|high|xhigh|max|auto`, token pricing per 1M: text in $5, image in $8, image out $30 (batch $15).
 *  - developers.openai.com/api/docs/models/gpt-6-luna: $0.10 in / $0.50 out per 1M tokens ("most efficient model for focused,
 *    high-volume tasks"); gpt-6.1-terra: $1.00 in / $5.00 out.
 * The model ids are NOT hard-wired: Settings stores whatever the admin picks, and `resolveModel` checks it against /v1/models.
 */

export const DEFAULT_TEXT_MODEL = "gpt-6-luna";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";
/** Tried in order when the configured model is no longer served by the company's OpenAI account. */
export const TEXT_MODEL_FALLBACKS = ["gpt-6-luna", "gpt-6.1-terra"] as const;
export const IMAGE_MODEL_FALLBACKS = ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"] as const;


// ── Classifying /v1/models ──────────────────────────────────────────────────

const NOT_TEXT = /(image|audio|realtime|tts|transcribe|embedding|moderation|whisper|dall-e|sora|search|codex|computer-use|instruct|live|diarize|davinci|babbage)/i;

/** Splits the ids returned by GET /v1/models into models usable for text generation and for image generation. */
export function classifyModels(ids: readonly string[]): { text: string[]; image: string[] } {
  const image = ids.filter((id) => /^(gpt-image|chatgpt-image)/.test(id)).sort();
  const text = ids.filter((id) => /^(gpt-|o\d)/.test(id) && !NOT_TEXT.test(id)).sort();
  return { text, image };
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type ModelList = { ok: true; ids: string[] } | { ok: false; error: string };

/** GET /v1/models with the company's key. Never throws; a failure is reported so callers can decide (health shows it, generation proceeds). */
export async function fetchModelIds(opts: { apiKey: string; organization?: string; project?: string; baseUrl?: string; fetchFn?: FetchFn }): Promise<ModelList> {
  const f = opts.fetchFn ?? fetch;
  try {
    const res = await f(`${opts.baseUrl ?? "https://api.openai.com"}/v1/models`, {
      headers: { Authorization: `Bearer ${opts.apiKey}`, ...(opts.organization ? { "OpenAI-Organization": opts.organization } : {}), ...(opts.project ? { "OpenAI-Project": opts.project } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) return { ok: false, error: "OpenAI rejected the API key." };
    if (res.status === 403) return { ok: false, error: "The OpenAI key is not allowed to list models (the Models read permission is missing), so model availability can't be checked." };
    if (!res.ok) return { ok: false, error: `OpenAI answered HTTP ${res.status} when listing models.` };
    const body = (await res.json()) as { data?: { id?: unknown }[] };
    const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
    if (!ids.length) return { ok: false, error: "OpenAI returned an empty model list." };
    return { ok: true, ids };
  } catch {
    return { ok: false, error: "Could not reach OpenAI to list models." };
  }
}

// ── Choosing a model ────────────────────────────────────────────────────────

export interface ModelChoice {
  /** The model to call. */
  model: string;
  /** What Settings asked for. */
  requested: string;
  fellBack: boolean;
  /** Plain-language note when `fellBack`, else null. */
  note: string | null;
}

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

const has = (available: ReadonlySet<string>, id: string) => available.has(id) || [...available].some((a) => a.startsWith(`${id}-`));

/**
 * `available` = ids served to this company, or null when the list could not be read (then the configured model is used as is: a
 * failed check must not block generation, the real call will report the true error).
 * Throws ModelUnavailableError, with a message naming what is available, when the configured model and every fallback are missing.
 */
export function resolveModel(kind: "text" | "image", requested: string, available: ReadonlySet<string> | null): ModelChoice {
  if (!available || has(available, requested)) return { model: requested, requested, fellBack: false, note: null };
  const chain = kind === "image" ? IMAGE_MODEL_FALLBACKS : TEXT_MODEL_FALLBACKS;
  const label = kind === "image" ? "image" : "text";
  const alt = chain.find((m) => m !== requested && has(available, m));
  if (alt) return { model: alt, requested, fellBack: true, note: `The ${label} model "${requested}" is not available on your OpenAI account any more (retired or no access), so "${alt}" was used instead. Update it in Settings > AI.` };
  const pool = kind === "image" ? classifyModels([...available]).image : classifyModels([...available]).text;
  throw new ModelUnavailableError(`The ${label} model "${requested}" is not available on your OpenAI account and no replacement was found.${pool.length ? ` Available: ${pool.slice(0, 8).join(", ")}.` : ""} Choose a model in Settings > AI.`);
}

// ── Cached availability for the current company ─────────────────────────────

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; list: ModelList }>();

/** The company's OpenAI model list (cached 10 minutes per company). */
export async function listAvailableModels(opts: { force?: boolean; fetchFn?: FetchFn } = {}): Promise<ModelList> {
  const conn = await resolveConnection("openai");
  const apiKey = conn?.values.apiKey;
  if (!apiKey) return { ok: false, error: "OpenAI isn't connected for this workspace." };
  const key = `${(await currentCompanyIdOrNull()) ?? "-"}|${apiKey.slice(-6)}`;
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.list;
  const list = await fetchModelIds({ apiKey, organization: conn?.values.organization, project: conn?.values.project, fetchFn: opts.fetchFn });
  // A failed lookup is only remembered for a minute so a transient error doesn't hide models for ten.
  cache.set(key, { at: list.ok ? Date.now() : Date.now() - TTL_MS + 60_000, list });
  return list;
}

/** Resolves the model for one call using the live list; when the list can't be read the configured model is used. */
export async function resolveForCall(kind: "text" | "image", requested: string): Promise<ModelChoice> {
  const list = await listAvailableModels();
  const choice = resolveModel(kind, requested, list.ok ? new Set(list.ids) : null);
  if (choice.fellBack && choice.note) console.warn(`[viralpulse] ${choice.note}`);
  return choice;
}
