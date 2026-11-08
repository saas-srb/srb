import { getPrompt } from "@/lib/prompts/store";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getOpenAI } from "@/lib/openai";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getCompanyBrand } from "@/lib/platform/branding";

export const CHATBOT_CONFIG_COLLECTION = "ai_chatbot_config";
const CONFIG_ID = "default";

export interface ChatbotRateLimit {
  /** Max chat messages one visitor (IP) may send per rolling minute. */
  perMinute: number;
  /** Max chat messages one visitor (IP) may send per rolling day. */
  perDay: number;
  /** Max characters accepted in a single user message. */
  maxMessageChars: number;
}

export type PreChatFieldMode = "required" | "optional" | "off";

/** Pre-chat "tell us who you are" form shown before the conversation starts. */
export interface PreChatConfig {
  enabled: boolean;
  title: string;
  description: string;
  fields: {
    name: PreChatFieldMode;
    email: PreChatFieldMode;
    phone: PreChatFieldMode;
    /** "Main Service" dropdown — one of the 5 primary services. Drives which lead source / account role gets created. */
    service: PreChatFieldMode;
  };
  consentText: string;
}

/** ElevenLabs voice-mode settings for the Ask page. */
export interface VoiceConfig {
  enabled: boolean;
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  streaming: boolean;
}

export interface ChatbotConfig {
  _id: string;
  /** OpenAI model id used for answer generation (Responses API). */
  model: string;
  temperature: number;
  maxOutputTokens: number;
  /** System instructions sent as `instructions` on every Responses call. */
  systemPrompt: string;
  retrieval: {
    /** `max_num_results` passed to the file_search tool. */
    maxNumResults: number;
  };
  /** How many prior messages (user+assistant) to replay as conversation context. */
  contextMessageLimit: number;
  /** OpenAI Vector Store id holding the knowledge base. Null until first index. */
  vectorStoreId: string | null;
  rateLimit: ChatbotRateLimit;
  /** Assistant's opening message on the welcome screen. */
  welcomeMessage: string;
  /** Prompt chips shown on the welcome screen. */
  suggestedQuestions: string[];
  /** Visitor identification form shown before the first message. */
  preChat: PreChatConfig;
  /** ElevenLabs voice-mode settings. */
  voice: VoiceConfig;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export type SerializedChatbotConfig = Omit<ChatbotConfig, "updatedAt" | "createdAt"> & {
  updatedAt: string;
  createdAt: string;
};

/** Neutral placeholder — every company's real prompt, greeting and questions are built in its own name by `defaultConfig()`. */
const DEFAULT_SYSTEM_PROMPT = "";

const DEFAULT_CONFIG: Omit<ChatbotConfig, "_id" | "createdAt" | "updatedAt"> = {
  model: "gpt-4.1-mini",
  temperature: 0.3,
  maxOutputTokens: 1200,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  retrieval: { maxNumResults: 8 },
  contextMessageLimit: 10,
  vectorStoreId: null,
  rateLimit: { perMinute: 8, perDay: 200, maxMessageChars: 2000 },
  welcomeMessage: "",
  suggestedQuestions: [],
  preChat: {
    enabled: true,
    title: "Before we start",
    description:
      "Tell us who you are so our team can follow up on anything the assistant can't fully answer.",
    fields: { name: "required", email: "required", phone: "required", service: "required" },
    consentText: "",
  },
  voice: {
    enabled: false,
    // "Rachel" — a widely-available stock ElevenLabs voice; change in AI Config.
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    modelId: "eleven_flash_v2_5",
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    speed: 1.0,
    streaming: true,
  },
  updatedBy: null,
};

/**
 * Every company's assistant starts from a generic prompt and greeting in its
 * own name.
 */
async function defaultConfig(): Promise<typeof DEFAULT_CONFIG> {
  const name = (await getCompanyBrand()).name;
  return {
    ...DEFAULT_CONFIG,
    systemPrompt: await getPrompt("chatbot.system.default", { name }),
    welcomeMessage: await getPrompt("chatbot.welcome.default", { name }),
    suggestedQuestions: (await getPrompt("chatbot.suggested.default", { name })).split("\n").map((q) => q.trim()).filter(Boolean),
    preChat: { ...DEFAULT_CONFIG.preChat, consentText: await getPrompt("chatbot.consent.default", { name }) },
  };
}

let indexesEnsured = false;

async function getConfigCollection(): Promise<Collection<ChatbotConfig>> {
  const db = await getDb();
  const collection = db.collection<ChatbotConfig>(CHATBOT_CONFIG_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    // _id is a fixed string ("default"); no extra indexes needed, but keep the
    // hook here for consistency with the other data-access modules.
  }
  return collection;
}

/** Reads the singleton config, seeding defaults on first access. */
export async function getChatbotConfig(): Promise<ChatbotConfig> {
  const config = await readChatbotConfig();
  // The "Main service" choice is the operator's own list of services (`categories.ts`); no other company's visitor is asked it.
  if (!(await isPlatformOwnerContext())) config.preChat = { ...config.preChat, fields: { ...config.preChat.fields, service: "off" } };
  return config;
}

async function readChatbotConfig(): Promise<ChatbotConfig> {
  const collection = await getConfigCollection();
  const existing = await collection.findOne({ _id: CONFIG_ID });
  const DEFAULTS = await defaultConfig();
  if (existing) {
    // Backfill any keys added after this document was first written.
    return {
      ...DEFAULTS,
      ...existing,
      retrieval: { ...DEFAULTS.retrieval, ...existing.retrieval },
      rateLimit: { ...DEFAULTS.rateLimit, ...existing.rateLimit },
      preChat: {
        ...DEFAULTS.preChat,
        ...existing.preChat,
        // Email and phone are always required site-wide; older docs may still say otherwise.
        fields: { ...DEFAULTS.preChat.fields, ...existing.preChat?.fields, email: "required", phone: "required" },
      },
      voice: { ...DEFAULTS.voice, ...existing.voice },
      _id: CONFIG_ID,
    };
  }

  const now = new Date();
  const doc: ChatbotConfig = { _id: CONFIG_ID, ...DEFAULTS, createdAt: now, updatedAt: now };
  await collection.updateOne(
    { _id: CONFIG_ID },
    { $setOnInsert: doc },
    { upsert: true }
  );
  return doc;
}

export function serializeChatbotConfig(config: ChatbotConfig): SerializedChatbotConfig {
  return {
    ...config,
    createdAt: new Date(config.createdAt).toISOString(),
    updatedAt: new Date(config.updatedAt).toISOString(),
  };
}

export interface ChatbotConfigInput {
  model?: unknown;
  temperature?: unknown;
  maxOutputTokens?: unknown;
  systemPrompt?: unknown;
  maxNumResults?: unknown;
  contextMessageLimit?: unknown;
  rateLimitPerMinute?: unknown;
  rateLimitPerDay?: unknown;
  maxMessageChars?: unknown;
  welcomeMessage?: unknown;
  suggestedQuestions?: unknown;
  preChat?: unknown;
  voice?: unknown;
}

const VOICE_MODELS = ["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2"];

function validateVoice(input: unknown): { ok: true; value: VoiceConfig } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid voice settings." };
  const raw = input as Record<string, unknown>;

  const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  };

  const voiceId = typeof raw.voiceId === "string" ? raw.voiceId.trim().slice(0, 100) : "";
  if (!voiceId) return { ok: false, error: "A default voice is required." };

  const modelId =
    typeof raw.modelId === "string" && VOICE_MODELS.includes(raw.modelId)
      ? raw.modelId
      : "eleven_flash_v2_5";

  return {
    ok: true,
    value: {
      enabled: raw.enabled === true,
      voiceId,
      modelId,
      stability: clamp(raw.stability, 0, 1, 0.5),
      similarityBoost: clamp(raw.similarityBoost, 0, 1, 0.75),
      style: clamp(raw.style, 0, 1, 0),
      speed: clamp(raw.speed, 0.7, 1.2, 1.0),
      streaming: raw.streaming !== false,
    },
  };
}

const FIELD_MODES: PreChatFieldMode[] = ["required", "optional", "off"];

function validatePreChat(
  input: unknown
): { ok: true; value: PreChatConfig } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid pre-chat form settings." };
  const raw = input as Record<string, unknown>;
  const rawFields = (raw.fields ?? {}) as Record<string, unknown>;

  const field = (v: unknown, fallback: PreChatFieldMode): PreChatFieldMode =>
    typeof v === "string" && (FIELD_MODES as string[]).includes(v) ? (v as PreChatFieldMode) : fallback;

  const str = (v: unknown, max: number): string =>
    (typeof v === "string" ? v : "").trim().slice(0, max);

  const value: PreChatConfig = {
    enabled: raw.enabled !== false,
    title: str(raw.title, 120) || "Before we start",
    description: str(raw.description, 400),
    fields: {
      name: field(rawFields.name, "required"),
      // Always required site-wide — not admin-configurable.
      email: "required",
      phone: "required",
      service: field(rawFields.service, "required"),
    },
    consentText: str(raw.consentText, 400),
  };
  return { ok: true, value };
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Hand-rolled validation, mirroring src/lib/lead-validation.ts. */
export function validateChatbotConfig(
  input: ChatbotConfigInput
): { valid: true; data: Partial<ChatbotConfig> } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data: Partial<ChatbotConfig> = {};
  const retrieval: Partial<ChatbotConfig["retrieval"]> = {};
  const rateLimit: Partial<ChatbotRateLimit> = {};

  if (input.model !== undefined) {
    const model = typeof input.model === "string" ? input.model.trim() : "";
    if (!model) errors.model = "Model is required.";
    else if (model.length > 100) errors.model = "Model name is too long.";
    else data.model = model;
  }

  if (input.temperature !== undefined) {
    const t = num(input.temperature);
    if (t === null || t < 0 || t > 2) errors.temperature = "Temperature must be between 0 and 2.";
    else data.temperature = Math.round(t * 100) / 100;
  }

  if (input.maxOutputTokens !== undefined) {
    const n = num(input.maxOutputTokens);
    if (n === null || n < 128 || n > 8192) errors.maxOutputTokens = "Max tokens must be between 128 and 8192.";
    else data.maxOutputTokens = Math.round(n);
  }

  if (input.systemPrompt !== undefined) {
    const p = typeof input.systemPrompt === "string" ? input.systemPrompt.trim() : "";
    if (!p) errors.systemPrompt = "System prompt cannot be empty.";
    else if (p.length > 8000) errors.systemPrompt = "System prompt must be 8000 characters or fewer.";
    else data.systemPrompt = p;
  }

  if (input.maxNumResults !== undefined) {
    const n = num(input.maxNumResults);
    if (n === null || n < 1 || n > 50) errors.maxNumResults = "Retrieved results must be between 1 and 50.";
    else retrieval.maxNumResults = Math.round(n);
  }

  if (input.contextMessageLimit !== undefined) {
    const n = num(input.contextMessageLimit);
    if (n === null || n < 0 || n > 40) errors.contextMessageLimit = "Context size must be between 0 and 40 messages.";
    else data.contextMessageLimit = Math.round(n);
  }

  if (input.rateLimitPerMinute !== undefined) {
    const n = num(input.rateLimitPerMinute);
    if (n === null || n < 1 || n > 120) errors.rateLimitPerMinute = "Per-minute limit must be between 1 and 120.";
    else rateLimit.perMinute = Math.round(n);
  }

  if (input.rateLimitPerDay !== undefined) {
    const n = num(input.rateLimitPerDay);
    if (n === null || n < 1 || n > 100000) errors.rateLimitPerDay = "Per-day limit must be between 1 and 100000.";
    else rateLimit.perDay = Math.round(n);
  }

  if (input.maxMessageChars !== undefined) {
    const n = num(input.maxMessageChars);
    if (n === null || n < 100 || n > 8000) errors.maxMessageChars = "Message length limit must be between 100 and 8000.";
    else rateLimit.maxMessageChars = Math.round(n);
  }

  if (input.welcomeMessage !== undefined) {
    const w = typeof input.welcomeMessage === "string" ? input.welcomeMessage.trim() : "";
    if (!w) errors.welcomeMessage = "Welcome message cannot be empty.";
    else if (w.length > 1000) errors.welcomeMessage = "Welcome message must be 1000 characters or fewer.";
    else data.welcomeMessage = w;
  }

  if (input.suggestedQuestions !== undefined) {
    const list = Array.isArray(input.suggestedQuestions)
      ? input.suggestedQuestions
      : typeof input.suggestedQuestions === "string"
        ? input.suggestedQuestions.split("\n")
        : [];
    const cleaned = list
      .map((q) => (typeof q === "string" ? q.trim() : ""))
      .filter(Boolean)
      .slice(0, 8);
    if (cleaned.some((q) => q.length > 200)) errors.suggestedQuestions = "Each question must be 200 characters or fewer.";
    else data.suggestedQuestions = cleaned;
  }

  if (input.preChat !== undefined) {
    const result = validatePreChat(input.preChat);
    if (!result.ok) errors.preChat = result.error;
    else data.preChat = result.value;
  }

  if (input.voice !== undefined) {
    const result = validateVoice(input.voice);
    if (!result.ok) errors.voice = result.error;
    else data.voice = result.value;
  }

  if (Object.keys(retrieval).length > 0) data.retrieval = retrieval as ChatbotConfig["retrieval"];
  if (Object.keys(rateLimit).length > 0) data.rateLimit = rateLimit as ChatbotRateLimit;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data };
}

export async function updateChatbotConfig(
  patch: Partial<ChatbotConfig>,
  updatedBy: string | null
): Promise<ChatbotConfig> {
  await getChatbotConfig(); // ensure the document exists
  const collection = await getConfigCollection();

  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "_id" || value === undefined) continue;
    if (key === "retrieval" && value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) set[`retrieval.${k}`] = v;
    } else if (key === "rateLimit" && value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) set[`rateLimit.${k}`] = v;
    } else {
      set[key] = value;
    }
  }

  await collection.updateOne({ _id: CONFIG_ID }, { $set: set });
  return getChatbotConfig();
}

/**
 * Returns the OpenAI Vector Store id for the knowledge base, creating one the
 * first time it's needed. Order of preference:
 *   1. `vectorStoreId` already stored in the config document
 *   2. `OPENAI_CHATBOT_VECTOR_STORE_ID` env var (persisted into the config)
 *   3. a freshly created vector store (persisted into the config)
 */
export async function ensureVectorStore(): Promise<string> {
  const config = await getChatbotConfig();
  setAiFeature("Chatbot knowledge base");
  const openai = await getOpenAI();

  if (config.vectorStoreId) {
    try {
      await openai.vectorStores.retrieve(config.vectorStoreId);
      return config.vectorStoreId;
    } catch {
      // Stored id no longer resolves (deleted upstream) — fall through and recreate.
    }
  }

  // The env-configured store holds the platform owner's own knowledge base.
  const envId = (await isPlatformOwnerContext()) ? process.env.OPENAI_CHATBOT_VECTOR_STORE_ID?.trim() : undefined;
  if (envId) {
    try {
      await openai.vectorStores.retrieve(envId);
      await updateChatbotConfig({ vectorStoreId: envId }, "system");
      return envId;
    } catch {
      // Configured env id is invalid — ignore and create a new store.
    }
  }

  const store = await openai.vectorStores.create({ name: `${(await getCompanyBrand()).name} Knowledge Base` });
  await updateChatbotConfig({ vectorStoreId: store.id }, "system");
  return store.id;
}
