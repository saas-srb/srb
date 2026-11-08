import "server-only";
import { getBot } from "@/lib/products/agentos/bots";
import { LIMITS } from "@/lib/products/agentos/constants";
import { normalizeVoiceInput, VoiceConfigError } from "@/lib/products/agentos/voice/config";
import { normalizePersona } from "@/lib/products/agentos/voice/prompt";
import { ElevenLabsAgentError, ttsModelFor, type AgentClient } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { NOT_CONFIGURED_MESSAGE, workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import { buildVoicePreviewOverrides, SAMPLE_TEXT_MAX } from "@/lib/products/agentos/preview-shared";
import { AibotsInputError } from "@/lib/products/agentos/viewer";

/**
 * "Try it" for VOICE agents. Uses ElevenLabs conversation overrides (prompt, first message, language, voice) on the agent's
 * already-synced ElevenLabs agent, so the DRAFT can be spoken to before it is saved. Needs the agent to exist on ElevenLabs (saved + synced once).
 * The call is not stored (no chat row, no transcript) and the browser only gets a short-lived signed URL.
 */

export interface PreviewDeps {
  client?: () => Promise<AgentClient | null>;
  gate?: () => Promise<string | null>;
  tts?: (text: string, cfg: { voiceId: string; modelId: string }) => Promise<Uint8Array>;
}

async function defaultGate() {
  return (await import("@/lib/platform/billing/enforce")).voiceBlockReason();
}

function draftFrom(raw: unknown) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let voice;
  try {
    voice = normalizeVoiceInput(r);
  } catch (err) {
    if (err instanceof VoiceConfigError) throw new AibotsInputError(err.message);
    throw err;
  }
  const instructions = typeof r.instructions === "string" ? r.instructions.trim().slice(0, LIMITS.instructionsMax) : "";
  if (!instructions) throw new AibotsInputError("Write the instructions first - the test call uses what is in that box.");
  return { ...voice, ...normalizePersona(r), instructions };
}

export async function startVoicePreview(botId: string | null, rawDraft: unknown, deps: PreviewDeps = {}) {
  const draft = draftFrom(rawDraft);
  const bot = botId ? await getBot(botId) : null;
  if (!bot || bot.kind !== "voice" || !bot.voice) throw new AibotsInputError("Save the agent first. The test call speaks through the agent's ElevenLabs setup, which is created when you save.");
  if (!bot.voice.elevenAgentId) throw new AibotsInputError(bot.voice.syncError ? `The agent isn't set up on ElevenLabs yet: ${bot.voice.syncError}` : "The agent isn't set up on ElevenLabs yet. Use Sync now, then try again.");
  // A public agent takes visitors from the internet: draft overrides must never be switched on for it (visitors could use them too).
  if (bot.voice.isPublic === true) throw new AibotsInputError("This agent is listed on your website, so draft test calls are switched off for it. Save your changes, then call it from its page, or take it off the website first.");
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
  const blocked = await (deps.gate ?? defaultGate)();
  if (blocked) throw new AibotsInputError(blocked);
  try {
    await client.enablePreviewOverrides(bot.voice.elevenAgentId);
    const signedUrl = await client.getSignedUrl(bot.voice.elevenAgentId);
    return { signedUrl, overrides: buildVoicePreviewOverrides(draft) };
  } catch (err) {
    throw new AibotsInputError(err instanceof ElevenLabsAgentError ? err.message : "Couldn't start the test call. Try again.");
  }
}

/** Speaks `text` in the chosen voice so the person can hear the tone. Returns an mp3 data URL. */
export async function speakSample(rawVoiceId: unknown, rawLanguage: unknown, rawText: unknown, deps: PreviewDeps = {}): Promise<string> {
  const voiceId = typeof rawVoiceId === "string" ? rawVoiceId.trim() : "";
  if (!/^[\w-]{6,64}$/.test(voiceId)) throw new AibotsInputError("Pick a voice first.");
  const language = typeof rawLanguage === "string" && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(rawLanguage.trim()) ? rawLanguage.trim() : "en";
  const text = typeof rawText === "string" ? rawText.trim().slice(0, SAMPLE_TEXT_MAX) : "";
  if (!text) throw new AibotsInputError("Type a sentence to hear.");
  const blocked = await (deps.gate ?? defaultGate)();
  if (blocked) throw new AibotsInputError(blocked);
  const tts =
    deps.tts ??
    (async (t: string, cfg: { voiceId: string; modelId: string }) => {
      const { streamTts, isElevenLabsConfigured } = await import("@/lib/elevenlabs");
      if (!(await isElevenLabsConfigured())) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
      const stream = await streamTts(t, { ...cfg, stability: 0.5, similarityBoost: 0.75, style: 0, speed: 1 });
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2 * 1024 * 1024) throw new AibotsInputError("That sample is too long.");
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    });
  try {
    const audio = await tts(text, { voiceId, modelId: ttsModelFor(language) });
    return `data:audio/mpeg;base64,${Buffer.from(audio).toString("base64")}`;
  } catch (err) {
    if (err instanceof AibotsInputError) throw err;
    console.error("[agentos preview] tts failed", err instanceof Error ? err.message.slice(0, 200) : err);
    throw new AibotsInputError("Couldn't generate that sample. Check the voice and the ElevenLabs connection, then try again.");
  }
}
