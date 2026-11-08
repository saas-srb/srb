"use server";

import { revalidatePath } from "next/cache";
import type { AibotsPermission } from "@/lib/aibots-roles";
import { requireViewer, can, AibotsInputError, NotFoundError, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { getBot } from "@/lib/products/agentos/bots";
import { recordAudit } from "@/lib/products/agentos/audit";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";
import { listVoices, type ElevenLabsVoice } from "@/lib/elevenlabs";
import { workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import { ElevenLabsAgentError, type ElevenLanguage } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { syncVoiceAgent } from "@/lib/products/agentos/voice/sync";
import { finishVoiceCall, getVoiceCall, refreshVoiceCall, startVoiceCall, type StartedCall, type VoiceCallView } from "@/lib/products/agentos/voice/calls";

/**
 * Voice-agent server actions. Like every AgentOS action, the viewer comes from the SESSION COOKIE (never from arguments) and the
 * permission is re-checked here. The ElevenLabs API key never leaves the server: the browser only ever receives a short-lived signed URL.
 */

type Fail = { ok: false; error: string };
type Ok<T> = { ok: true } & T;

async function run<T extends object>(permission: AibotsPermission | null, fn: (v: AibotsViewer) => Promise<T>, opts: { write?: boolean } = {}): Promise<Ok<T> | Fail> {
  let v: AibotsViewer;
  try {
    v = await requireViewer();
  } catch {
    return { ok: false, error: "Your session has expired — please sign in again." };
  }
  if (permission && !can(v, permission)) return { ok: false, error: "You don't have permission to do that." };
  if (opts.write) {
    const readOnly = await writeBlockReason();
    if (readOnly) return { ok: false, error: readOnly };
  }
  try {
    return { ok: true, ...(await fn(v)) };
  } catch (err) {
    if (err instanceof AibotsInputError || err instanceof ElevenLabsAgentError || isBillingLimitError(err)) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: "That agent or call is no longer available." };
    console.error("[agentos voice action]", err instanceof Error ? err.message : err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export interface VoiceOptions {
  configured: boolean;
  voices: ElevenLabsVoice[];
  languages: ElevenLanguage[];
}

/** The voice and language pickers for the agent form, read live from the company's ElevenLabs account (editors only). */
export async function loadVoiceOptionsAction(): Promise<Ok<VoiceOptions> | Fail> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: "Your session has expired — please sign in again." };
  if (!can(v, "EDIT_BOT") && !can(v, "CREATE_BOT")) return { ok: false, error: "You don't have permission to do that." };
  const client = await workspaceAgentClient();
  if (!client) return { ok: true, configured: false, voices: [], languages: [] };
  try {
    const [voices, languages] = await Promise.all([listVoices(), client.listLanguages()]);
    return { ok: true, configured: true, voices, languages };
  } catch (err) {
    return { ok: false, error: err instanceof ElevenLabsAgentError ? err.message : "Couldn't load voices from ElevenLabs. Check the API key in Settings → Integrations." };
  }
}

export async function retryVoiceSyncAction(botId: string) {
  return run("EDIT_BOT", async (v) => {
    const bot = await getBot(botId);
    if (!bot || bot.kind !== "voice") throw new NotFoundError();
    const res = await syncVoiceAgent(botId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "bot", entityId: botId, entityLabel: bot.name, botId, summary: res.ok ? "Voice agent synced" : "Voice sync failed" });
    revalidatePath("/agentos", "layout");
    return { synced: res.ok, syncedAt: res.voice?.syncedAt ? new Date(res.voice.syncedAt).toISOString() : null, syncError: res.voice?.syncError ?? null, elevenAgentId: res.voice?.elevenAgentId ?? null };
  }, { write: true });
}

/** Mints a signed URL for one call. Refused unless the viewer may use the agent. */
export async function startVoiceCallAction(botId: string): Promise<Ok<StartedCall> | Fail> {
  return run(null, (v) => startVoiceCall(v, botId), { write: true });
}

/** After the call ends: stores the transcript and counts the minutes. May be called again while ElevenLabs is still processing. */
export async function finishVoiceCallAction(chatId: string, conversationId: string): Promise<Ok<{ call: VoiceCallView }> | Fail> {
  return run(null, async (v) => ({ call: await finishVoiceCall(v, chatId, conversationId) }));
}

export async function loadVoiceCallAction(chatId: string): Promise<Ok<{ call: VoiceCallView }> | Fail> {
  return run(null, async (v) => ({ call: await getVoiceCall(v, chatId) }));
}

export async function refreshVoiceCallAction(chatId: string): Promise<Ok<{ call: VoiceCallView }> | Fail> {
  return run(null, async (v) => ({ call: await refreshVoiceCall(v, chatId) }));
}
