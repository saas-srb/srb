import { normalizePersona } from "@/lib/products/agentos/voice/prompt";
import { DataFieldError, isPurposeKey, normalizeDataFields } from "@/lib/products/agentos/calls/purposes";
import type { VoiceConfig } from "@/lib/products/agentos/voice/types";

/** Bounds for the editable voice fields. Client-safe (no server imports) so the form and the server validate alike. */
export const VOICE_LIMITS = {
  firstMessageMax: 500,
  maxDurationMin: 30,
  maxDurationMax: 3600,
} as const;

export class VoiceConfigError extends Error {}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A blank voice block for a new voice agent: nothing chosen yet (the company picks everything). */
export function emptyVoiceConfig(): VoiceConfig {
  return { voiceId: "", voiceName: "", language: "", firstMessage: "", displayName: "", jobTitle: "", toneNote: "", disclosureLine: "", maxDurationSecs: null, elevenAgentId: null, syncedAt: null, syncError: null, knowledgeDocIds: [], purposes: [], dataFields: [], isPublic: false, allowedOrigins: [] };
}

/**
 * Validates what the form sent and keeps ONLY the editable fields. The sync fields (agent id, last sync, knowledge docs) are
 * server-owned: they come back as blanks here and are carried over from the stored row by `withServerFields`.
 */
export function normalizeVoiceInput(raw: unknown): VoiceConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voiceId = text(r.voiceId, 64);
  if (!voiceId) throw new VoiceConfigError("Pick a voice for this agent.");
  const language = text(r.language, 16);
  if (!/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(language)) throw new VoiceConfigError("Pick the language this agent speaks.");
  let maxDurationSecs: number | null = null;
  if (r.maxDurationSecs !== null && r.maxDurationSecs !== undefined && r.maxDurationSecs !== "") {
    const n = Number(r.maxDurationSecs);
    if (!Number.isInteger(n) || n < VOICE_LIMITS.maxDurationMin || n > VOICE_LIMITS.maxDurationMax) {
      throw new VoiceConfigError(`Maximum call length must be between ${VOICE_LIMITS.maxDurationMin} and ${VOICE_LIMITS.maxDurationMax} seconds.`);
    }
    maxDurationSecs = n;
  }
  // A form that never sent these keys (older clients) must not wipe what is stored: undefined here means "keep the stored value".
  const purposes = r.purposes === undefined ? undefined : Array.isArray(r.purposes) ? [...new Set(r.purposes.filter(isPurposeKey))] : [];
  let dataFields: ReturnType<typeof normalizeDataFields> | undefined;
  try {
    dataFields = r.dataFields === undefined ? undefined : normalizeDataFields(r.dataFields);
  } catch (err) {
    if (err instanceof DataFieldError) throw new VoiceConfigError(err.message);
    throw err;
  }
  return {
    ...emptyVoiceConfig(),
    voiceId,
    voiceName: text(r.voiceName, 120) || voiceId,
    language,
    firstMessage: text(r.firstMessage, VOICE_LIMITS.firstMessageMax),
    ...normalizePersona(r),
    maxDurationSecs,
    purposes,
    dataFields,
    isPublic: r.isPublic === undefined ? undefined : r.isPublic === true,
    allowedOrigins: r.allowedOrigins === undefined ? undefined : normalizeOrigins(r.allowedOrigins),
  };
}

/** Website origins as `scheme://host[:port]`: https only (http only for localhost), no paths, deduplicated, at most 20. */
export function normalizeOrigins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    let u: URL;
    try {
      u = new URL(item.trim());
    } catch {
      throw new VoiceConfigError(`"${String(item).slice(0, 80)}" isn't a website address. Use the form https://example.com.`);
    }
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (!(u.protocol === "https:" || (u.protocol === "http:" && local))) throw new VoiceConfigError(`"${u.origin}" must start with https://.`);
    out.add(u.origin);
    if (out.size >= 20) break;
  }
  return [...out];
}

/** Editable fields from the form + the sync state already stored for this agent. */
export function withServerFields(next: VoiceConfig, stored: VoiceConfig | null | undefined): VoiceConfig {
  return {
    ...next,
    elevenAgentId: stored?.elevenAgentId ?? null,
    syncedAt: stored?.syncedAt ?? null,
    syncError: stored?.syncError ?? null,
    knowledgeDocIds: stored?.knowledgeDocIds ?? [],
    purposes: next.purposes ?? stored?.purposes ?? [],
    dataFields: next.dataFields ?? stored?.dataFields ?? [],
    isPublic: next.isPublic ?? stored?.isPublic ?? false,
    allowedOrigins: next.allowedOrigins ?? stored?.allowedOrigins ?? [],
  };
}
