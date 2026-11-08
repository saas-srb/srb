"use server";

import { requireViewer, can, AibotsInputError, NotFoundError } from "@/lib/products/agentos/viewer";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { ElevenLabsAgentError } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { runTextPreview } from "@/lib/products/agentos/text-preview";
import { speakSample, startVoicePreview } from "@/lib/products/agentos/voice/preview";

/**
 * "Try it" actions of the agent form. Same rules as saving: the viewer comes from the session cookie and must be allowed to create
 * or edit agents. Nothing here saves an agent, stores a chat or returns a key.
 */

type Fail = { ok: false; error: string };
type Ok<T> = { ok: true } & T;

async function run<T extends object>(fn: () => Promise<T>): Promise<Ok<T> | Fail> {
  let canEdit = false;
  try {
    const v = await requireViewer();
    canEdit = can(v, "EDIT_BOT") || can(v, "CREATE_BOT");
  } catch {
    return { ok: false, error: "Your session has expired — please sign in again." };
  }
  if (!canEdit) return { ok: false, error: "You don't have permission to do that." };
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof AibotsInputError || err instanceof ElevenLabsAgentError || isBillingLimitError(err)) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: "That agent is no longer available." };
    console.error("[agentos preview action]", err instanceof Error ? err.message : err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** One text-agent turn with the unsaved draft. `history` ends with the user's new message. */
export async function previewTextAgentAction(botId: string | null, draft: { instructions: string; model: string; temperature: string | number | null }, history: { role: "user" | "assistant"; text: string }[]) {
  return run(() => runTextPreview(botId, draft, history));
}

/** Signed URL + draft overrides for a test call with the unsaved voice settings. */
export async function previewVoiceAgentAction(botId: string | null, draft: Record<string, unknown>) {
  return run(() => startVoicePreview(botId, draft));
}

/** Plays a sentence in the chosen voice (returns an mp3 data URL). */
export async function speakVoiceSampleAction(voiceId: string, language: string, text: string) {
  return run(async () => ({ audio: await speakSample(voiceId, language, text) }));
}
