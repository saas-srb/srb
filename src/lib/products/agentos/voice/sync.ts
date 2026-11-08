import "server-only";
import { botsCollection, getBot, type BotDoc } from "@/lib/products/agentos/bots";
import { listBotFiles, getBotFileText } from "@/lib/products/agentos/knowledge";
import { aibotsCollection, notDeleted } from "@/lib/products/agentos/db";
import { getPublicCallSettings } from "@/lib/products/agentos/calls/settings";
import { buildAgentPayload, ElevenLabsAgentError, type AgentClient, type KnowledgeRef } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { NOT_CONFIGURED_MESSAGE, workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import type { VoiceConfig } from "@/lib/products/agentos/voice/types";

/**
 * Keeps the ElevenLabs agent in step with the bot row. The bot row is the source of truth and is saved FIRST; sync is a separate
 * step whose failure only sets `voice.syncError` (shown with a Retry button) - it never rolls back or loses the saved config.
 */

export interface KnowledgeDoc {
  name: string;
  text: string;
}

export interface SyncDeps {
  client?: () => Promise<AgentClient | null>;
  /** The text of the agent's enabled, indexed knowledge files. Default: read back from the bot's vector store. */
  knowledge?: (bot: BotDoc) => Promise<{ docs: KnowledgeDoc[]; skipped: string[] }>;
}

export type SyncResult = { ok: true; voice: VoiceConfig } | { ok: false; error: string; voice: VoiceConfig | null };

const KB_DOC_MAX_CHARS = 60000;

async function defaultKnowledge(bot: BotDoc): Promise<{ docs: KnowledgeDoc[]; skipped: string[] }> {
  const docs: KnowledgeDoc[] = [];
  const skipped: string[] = [];
  for (const f of await listBotFiles(bot._id)) {
    if (!f.enabled || f.status === "disabled") continue;
    if (f.status !== "ready") {
      skipped.push(f.title);
      continue;
    }
    try {
      const { text } = await getBotFileText(bot, f._id);
      if (text.trim()) docs.push({ name: f.title, text: text.slice(0, KB_DOC_MAX_CHARS) });
    } catch {
      skipped.push(f.title);
    }
  }
  return { docs, skipped };
}

// ---------------------------------------------------------------------------
// Remote cleanup queue: ElevenLabs ids that could not be deleted right now (no key connected, ElevenLabs down, the bot row already
// deleted). Retried whenever a client is available, so a removed agent is never silently left running (and billed) remotely.
// ---------------------------------------------------------------------------

export const CLEANUP_COLLECTION = "aibots_voice_cleanup";
export interface CleanupRow {
  _id: string; // the remote id
  kind: "agent" | "knowledge";
  botId: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
}
const MAX_DRAIN = 25;

export async function enqueueRemoteCleanup(botId: string, ids: { agentId?: string | null; knowledgeDocIds?: string[] }, error: string | null = null): Promise<void> {
  try {
    const col = await aibotsCollection<CleanupRow>(CLEANUP_COLLECTION);
    const rows: Array<[string, CleanupRow["kind"]]> = [...(ids.agentId ? [[ids.agentId, "agent"] as [string, CleanupRow["kind"]]] : []), ...(ids.knowledgeDocIds ?? []).map((d) => [d, "knowledge"] as [string, CleanupRow["kind"]])];
    for (const [id, kind] of rows) await col.updateOne({ _id: id }, { $setOnInsert: { kind, botId, attempts: 0, createdAt: new Date() }, $set: { lastError: error } }, { upsert: true });
  } catch (err) {
    console.error("[agentos voice] couldn't queue remote cleanup", err instanceof Error ? err.message : err);
  }
}

/** Deletes queued remote ids; returns how many are still waiting. Never throws. */
export async function drainRemoteCleanup(client: AgentClient): Promise<number> {
  try {
    const col = await aibotsCollection<CleanupRow>(CLEANUP_COLLECTION);
    for (const row of await col.find({}).sort({ createdAt: 1 }).limit(MAX_DRAIN).toArray()) {
      try {
        await (row.kind === "agent" ? client.deleteAgent(row._id) : client.deleteKnowledgeDoc(row._id));
        await col.deleteOne({ _id: row._id });
      } catch (err) {
        if (err instanceof ElevenLabsAgentError && err.code === "not_found") await col.deleteOne({ _id: row._id });
        else await col.updateOne({ _id: row._id }, { $inc: { attempts: 1 }, $set: { lastError: message(err).slice(0, 200) } });
      }
    }
    return await col.countDocuments({});
  } catch (err) {
    console.error("[agentos voice] cleanup queue failed", err instanceof Error ? err.message : err);
    return 0;
  }
}

const message = (err: unknown) => (err instanceof ElevenLabsAgentError ? err.message : "Syncing with ElevenLabs failed. Try again.");

async function saveVoice(botId: string, patch: Partial<VoiceConfig>) {
  const col = await botsCollection();
  const $set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) $set[`voice.${k}`] = v;
  await col.updateOne({ _id: botId, ...notDeleted }, { $set });
}

/** Like saveVoice but also for archived / soft-deleted rows (cleanup runs after the row was deleted). */
async function saveVoiceAny(botId: string, patch: Partial<VoiceConfig>) {
  const $set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) $set[`voice.${k}`] = v;
  await (await botsCollection()).updateOne({ _id: botId }, { $set });
}

/** Records a failure on the agent without touching anything else. */
async function fail(bot: BotDoc, error: string): Promise<SyncResult> {
  await saveVoice(bot._id, { syncError: error });
  return { ok: false, error, voice: bot.voice ? { ...bot.voice, syncError: error } : null };
}

/** A public agent can never run longer than the company's website-call limit (enforced by ElevenLabs, not by the visitor's browser). */
async function maxSecsFor(voice: NonNullable<BotDoc["voice"]>): Promise<number | null> {
  if (voice.isPublic !== true) return voice.maxDurationSecs;
  const cap = (await getPublicCallSettings()).publicMaxSessionSecs;
  return Math.min(voice.maxDurationSecs ?? cap, cap);
}

/**
 * Creates the ElevenLabs agent on first call and updates it afterwards, replacing its knowledge documents. Never throws.
 * Inactive agents are removed remotely (see `removeRemoteVoiceAgent`), so there is nothing live to bill or call.
 */
export async function syncVoiceAgent(botId: string, deps: SyncDeps = {}): Promise<SyncResult> {
  const bot = await getBot(botId);
  if (!bot || bot.kind !== "voice" || !bot.voice) return { ok: false, error: "This isn't a voice agent.", voice: null };
  if (bot.status !== "active") {
    await removeRemoteVoiceAgent(botId, deps);
    return { ok: true, voice: (await getBot(botId))?.voice ?? bot.voice };
  }
  const voice = bot.voice;
  try {
    const client = await (deps.client ?? workspaceAgentClient)();
    if (!client) return await fail(bot, NOT_CONFIGURED_MESSAGE);
    await drainRemoteCleanup(client);

    // 1. New knowledge documents (the old ones are removed only after the agent points at the new ones).
    const { docs, skipped } = await (deps.knowledge ?? defaultKnowledge)(bot);
    const created: KnowledgeRef[] = [];
    const discard = (refs: KnowledgeRef[]) => Promise.all(refs.map((r) => client.deleteKnowledgeDoc(r.id).catch(() => enqueueRemoteCleanup(bot._id, { knowledgeDocIds: [r.id] }))));
    try {
      for (const d of docs) created.push(await client.createKnowledgeText(d.name, d.text));

      // 2. Create or update the agent.
      const payload = buildAgentPayload({
        name: bot.name,
        instructions: bot.instructions,
        firstMessage: voice.firstMessage,
        language: voice.language,
        voiceId: voice.voiceId,
        maxDurationSecs: await maxSecsFor(voice),
        knowledge: created,
        persona: voice,
        purposes: voice.purposes,
        dataFields: voice.dataFields,
        lockOverrides: voice.isPublic === true,
      });
      let agentId = voice.elevenAgentId;
      let createdHere = false;
      if (agentId) {
        try {
          await client.updateAgent(agentId, payload);
        } catch (err) {
          if (!(err instanceof ElevenLabsAgentError) || err.code !== "not_found") throw err;
          agentId = null; // deleted on ElevenLabs: make a new one
        }
      }
      if (!agentId) {
        agentId = (await client.createAgent(payload)).agentId;
        createdHere = true;
        // Two saves racing must not leave two agents: only the first to record its id keeps it.
        const col = await botsCollection();
        const won = await col.updateOne({ _id: bot._id, $or: [{ "voice.elevenAgentId": null }, { "voice.elevenAgentId": voice.elevenAgentId }] }, { $set: { "voice.elevenAgentId": agentId } });
        if (won.matchedCount === 0) {
          await client.deleteAgent(agentId).catch(() => enqueueRemoteCleanup(bot._id, { agentId }));
          await discard(created);
          return await syncVoiceAgent(botId, deps);
        }
      }

      // Archive / delete may have happened while this sync was talking to ElevenLabs. If so, nothing here may stay alive remotely.
      const current = await getBot(botId);
      if (!current || current.status !== "active") {
        if (createdHere) {
          await client.deleteAgent(agentId).catch(() => enqueueRemoteCleanup(bot._id, { agentId }));
          await botsCollection().then((c) => c.updateOne({ _id: bot._id, "voice.elevenAgentId": agentId }, { $set: { "voice.elevenAgentId": null } }));
        }
        await Promise.all(created.map((r) => client.deleteKnowledgeDoc(r.id).catch(() => enqueueRemoteCleanup(bot._id, { knowledgeDocIds: [r.id] }))));
        return { ok: true, voice: current?.voice ?? voice };
      }

      // 3. Done: swap the knowledge ids, clear the error, drop the previous documents.
      const note = skipped.length ? `Synced, but these knowledge files weren't included yet (still indexing or unreadable): ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}.` : null;
      const next = { elevenAgentId: agentId, syncedAt: new Date(), syncError: note, knowledgeDocIds: created.map((c) => c.id), overridesLockedAt: voice.isPublic === true ? new Date() : null };
      await saveVoice(bot._id, next);
      await Promise.all(voice.knowledgeDocIds.map((id) => client.deleteKnowledgeDoc(id).catch(() => enqueueRemoteCleanup(bot._id, { knowledgeDocIds: [id] }))));
      return { ok: true, voice: { ...voice, ...next } };
    } catch (err) {
      await discard(created);
      throw err;
    }
  } catch (err) {
    return await fail(bot, message(err));
  }
}

/**
 * Deletes the ElevenLabs agent and its knowledge documents (archive / delete). Best-effort: never throws, never blocks the caller.
 * Whatever can't be deleted right now (no key connected, ElevenLabs down) is also written to the cleanup queue, so it is still
 * removed later even when the bot row itself is gone; the row keeps its ids until the removal succeeds.
 */
export async function removeRemoteVoiceAgent(botId: string, deps: SyncDeps = {}): Promise<void> {
  try {
    const col = await botsCollection();
    const bot = await col.findOne({ _id: botId });
    if (!bot?.voice?.elevenAgentId && !bot?.voice?.knowledgeDocIds.length) return;
    const v = bot.voice!;
    const client = await (deps.client ?? workspaceAgentClient)();
    if (!client) {
      await enqueueRemoteCleanup(botId, { agentId: v.elevenAgentId, knowledgeDocIds: v.knowledgeDocIds }, NOT_CONFIGURED_MESSAGE);
      return;
    }
    let agentGone = !v.elevenAgentId;
    if (v.elevenAgentId) {
      agentGone = await client.deleteAgent(v.elevenAgentId).then(() => true, (e) => e instanceof ElevenLabsAgentError && e.code === "not_found");
    }
    if (!agentGone) {
      await enqueueRemoteCleanup(botId, { agentId: v.elevenAgentId, knowledgeDocIds: v.knowledgeDocIds }, "ElevenLabs could not delete the agent");
      return; // keep the ids on the row too, so a later attempt can still clean up
    }
    const stuck: string[] = [];
    await Promise.all(v.knowledgeDocIds.map((id) => client.deleteKnowledgeDoc(id).catch((e) => { if (!(e instanceof ElevenLabsAgentError && e.code === "not_found")) stuck.push(id); })));
    if (stuck.length) await enqueueRemoteCleanup(botId, { knowledgeDocIds: stuck }, "ElevenLabs could not delete the document");
    await saveVoiceAny(botId, { elevenAgentId: null, knowledgeDocIds: [], syncedAt: null });
    await drainRemoteCleanup(client);
  } catch (err) {
    console.error("[agentos voice] remote cleanup failed", err instanceof Error ? err.message : err);
  }
}

/** Called when a voice agent's knowledge changed (file indexed, enabled/disabled, deleted). Re-syncs; ignores text agents. */
export async function resyncAfterKnowledgeChange(botId: string): Promise<void> {
  try {
    const bot = await getBot(botId);
    if (bot?.kind === "voice" && bot.status === "active" && bot.voice?.elevenAgentId) await syncVoiceAgent(botId);
  } catch {
    // best-effort; the Retry sync button covers it
  }
}
