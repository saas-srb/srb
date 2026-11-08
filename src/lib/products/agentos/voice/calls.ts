import "server-only";
import { getUsableBot } from "@/lib/products/agentos/bots";
import { chatsCollection, type ChatDoc, type VoiceCallRecord } from "@/lib/products/agentos/chats";
import { recordAuditThrottled } from "@/lib/products/agentos/audit";
import { recordVoiceSession } from "@/lib/products/agentos/hub";
import { notDeleted } from "@/lib/products/agentos/db";
import { AibotsInputError, NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { ElevenLabsAgentError, type AgentClient } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { NOT_CONFIGURED_MESSAGE, workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import { mirrorWebCallStart, mirrorWebCallUpdate, webDynamicVariables } from "@/lib/products/agentos/calls/web";

/**
 * A voice call is stored as a chat row (so the sidebar / Hub "agents I talked to" logic sees it) carrying `voiceCall`. The browser
 * gets a signed URL per call; once it ends, the transcript is read from the ElevenLabs conversation API, never trusted from the client.
 */

export interface CallDeps {
  client?: () => Promise<AgentClient | null>;
  /** Plan gate: a reason string blocks the call. Default: the plan's voice minutes (skipped on the company's own ElevenLabs key). */
  gate?: () => Promise<string | null>;
  /** Counts seconds against the plan. Default: usage metering, skipped on the company's own ElevenLabs key. */
  meter?: (seconds: number, botName: string) => Promise<void>;
}

export async function defaultGate(): Promise<string | null> {
  const { voiceBlockReason } = await import("@/lib/platform/billing/enforce");
  return voiceBlockReason();
}

export async function defaultMeter(seconds: number, botName: string): Promise<void> {
  const [{ usesOwnVoiceKey }, { recordUsage }] = await Promise.all([import("@/lib/elevenlabs"), import("@/lib/platform/billing/usage")]);
  if (await usesOwnVoiceKey()) return;
  await recordUsage("voice_seconds", seconds, new Date(), { source: "Voice agent call", detail: botName });
}

export interface StartedCall {
  chatId: string;
  signedUrl: string;
  /** Pass these as the session's dynamic variables when the agent's prompt uses call-purpose {{variables}} (blank values; empty object otherwise). */
  dynamicVariables: Record<string, string>;
}

/** Access check -> plan gate -> signed URL -> chat row. Throws AibotsInputError with a plain message on any refusal. */
export async function startVoiceCall(viewer: AibotsViewer, botId: string, deps: CallDeps = {}): Promise<StartedCall> {
  const bot = await getUsableBot(viewer, botId); // NotFound when the viewer may not use it (never reveals it exists)
  if (bot.kind !== "voice" || !bot.voice) throw new NotFoundError();
  if (bot.status !== "active") throw new AibotsInputError("This agent is switched off.");
  if (!bot.voice.elevenAgentId) throw new AibotsInputError(bot.voice.syncError ? `This agent isn't ready: ${bot.voice.syncError}` : "This agent hasn't been set up on ElevenLabs yet. An editor needs to save it or retry the sync.");
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
  const blocked = await (deps.gate ?? defaultGate)();
  if (blocked) throw new AibotsInputError(blocked);
  let signedUrl: string;
  try {
    signedUrl = await client.getSignedUrl(bot.voice.elevenAgentId);
  } catch (err) {
    throw new AibotsInputError(err instanceof ElevenLabsAgentError ? err.message : "Couldn't start the call. Try again.");
  }
  const chatId = await recordVoiceSession(viewer, bot._id, "Voice call");
  const col = await chatsCollection();
  const voiceCall: VoiceCallRecord = { conversationId: null, status: "started", durationSecs: null, transcript: null, meteredAt: null };
  await col.updateOne({ _id: chatId }, { $set: { voiceCall } });
  await mirrorWebCallStart(viewer, bot, chatId);
  return { chatId, signedUrl, dynamicVariables: await webDynamicVariables(bot) };
}

export interface VoiceCallView {
  chatId: string;
  title: string;
  startedAt: string;
  status: VoiceCallRecord["status"];
  durationSecs: number | null;
  /** Null in the list (loaded on open); present from `getVoiceCall`. */
  transcript: VoiceCallRecord["transcript"];
  hasTranscript: boolean;
  userEmail: string;
  botId: string;
  /** The ElevenLabs conversation was linked (the call connected). The id itself never leaves the server. */
  connected: boolean;
  /** ElevenLabs reported a recording (null = unknown). */
  hasAudio: boolean | null;
  summary: string | null;
  summaryTitle: string | null;
  callSuccess: "success" | "failure" | "unknown" | null;
  dataCollection: { key: string; value: string }[];
  terminationReason: string | null;
}

export function view(c: ChatDoc, withTranscript: boolean): VoiceCallView {
  const v = c.voiceCall!;
  return {
    chatId: c._id,
    title: c.title,
    startedAt: c.createdAt.toISOString(),
    status: v.status,
    durationSecs: v.durationSecs,
    transcript: withTranscript ? v.transcript : null,
    hasTranscript: Boolean(v.transcript?.length),
    userEmail: c.userEmail,
    botId: c.botId,
    connected: Boolean(v.conversationId),
    hasAudio: v.hasAudio ?? null,
    summary: v.summary ?? null,
    summaryTitle: v.summaryTitle ?? null,
    callSuccess: v.callSuccess ?? null,
    dataCollection: v.dataCollection ?? [],
    terminationReason: v.terminationReason ?? null,
  };
}

export async function ownCall(viewer: AibotsViewer, chatId: string, opts: { oversight?: boolean } = {}): Promise<ChatDoc> {
  if (typeof chatId !== "string" || chatId.length > 64) throw new NotFoundError();
  const chat = await (await chatsCollection()).findOne({ _id: chatId, ...notDeleted });
  if (!chat?.voiceCall) throw new NotFoundError();
  if (chat.userId !== viewer.userId && !(opts.oversight && can(viewer, "VIEW_CHATS"))) throw new NotFoundError();
  return chat;
}

const titleFor = (at: Date) => `Voice call · ${at.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;

const METER_LEASE_MS = 2 * 60 * 1000;

let linkIndexReady = false;
/** One conversation can belong to one chat only: the database enforces it, so two racing links can never both win. */
async function ensureLinkIndex(): Promise<void> {
  if (linkIndexReady) return;
  linkIndexReady = true;
  await (await chatsCollection())
    .createIndex({ "voiceCall.conversationId": 1 }, { unique: true, partialFilterExpression: { "voiceCall.conversationId": { $type: "string" } } })
    .catch((e) => console.error("[agentos voice] conversation index failed", e instanceof Error ? e.message : e));
}

const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;

/**
 * Counts a settled call's seconds once. A short lease is taken first; `meteredAt` is set ONLY after metering succeeded, so a failed
 * (or crashed) attempt leaves the call unmetered and the next finish / refresh / reconcile retries it. Two workers never both meter.
 */
async function meterOnce(chatId: string, seconds: number, botName: string, deps: CallDeps): Promise<void> {
  const col = await chatsCollection();
  const now = new Date();
  const lease = await col.updateOne(
    { _id: chatId, "voiceCall.meteredAt": null, $or: [{ "voiceCall.meterLeaseUntil": null }, { "voiceCall.meterLeaseUntil": { $lte: now } }] },
    { $set: { "voiceCall.meterLeaseUntil": new Date(now.getTime() + METER_LEASE_MS) } }
  );
  if (lease.modifiedCount !== 1) return;
  try {
    await (deps.meter ?? defaultMeter)(seconds, botName);
  } catch (e) {
    console.error("[agentos voice] metering failed, will retry", e instanceof Error ? e.message : e);
    await col.updateOne({ _id: chatId, "voiceCall.meteredAt": null }, { $set: { "voiceCall.meterLeaseUntil": null } });
    return;
  }
  await col.updateOne({ _id: chatId }, { $set: { "voiceCall.meteredAt": new Date(), "voiceCall.meterLeaseUntil": null } });
}

/** Stores one ElevenLabs conversation on the call's chat (atomically linking it) and meters it once it has settled. */
async function settleCall(chat: ChatDoc, botName: string, agentId: string, conversationId: string, client: AgentClient, deps: CallDeps): Promise<void> {
  const col = await chatsCollection();
  await ensureLinkIndex();
  let detail;
  try {
    detail = await client.getConversation(conversationId);
  } catch (err) {
    throw new AibotsInputError(err instanceof ElevenLabsAgentError ? err.message : "Couldn't load the call transcript. Try again.");
  }
  // Fail closed: a conversation must positively name this agent.
  if (!detail.agentId || detail.agentId !== agentId) throw new AibotsInputError("That conversation belongs to a different agent.");
  // It must have started after this call was set up; an earlier conversation (someone else's) can't be this call.
  if (!chat.voiceCall!.conversationId && detail.startedAt && new Date(detail.startedAt).getTime() < chat.createdAt.getTime() - 10_000) throw new AibotsInputError("That conversation started before this call.");

  const status: VoiceCallRecord["status"] = detail.status === "done" ? "done" : detail.status === "failed" ? "failed" : "processing";
  const now = new Date();
  let linked;
  try {
    // Atomic link: only this user's chat, and only while it is unlinked or already linked to this same conversation.
    linked = await col.updateOne(
      { _id: chat._id, userId: chat.userId, "voiceCall.conversationId": { $in: [null, conversationId] } },
      {
        $set: {
          "voiceCall.conversationId": conversationId,
          "voiceCall.status": status,
          "voiceCall.durationSecs": detail.durationSecs,
          "voiceCall.transcript": detail.transcript ?? chat.voiceCall!.transcript,
          "voiceCall.hasAudio": detail.hasAudio ?? chat.voiceCall!.hasAudio ?? null,
          "voiceCall.summary": detail.analysis?.summary ?? chat.voiceCall!.summary ?? null,
          "voiceCall.summaryTitle": detail.analysis?.title ?? chat.voiceCall!.summaryTitle ?? null,
          "voiceCall.callSuccess": detail.analysis?.callSuccess ?? chat.voiceCall!.callSuccess ?? null,
          "voiceCall.dataCollection": detail.analysis?.data.length ? detail.analysis.data : (chat.voiceCall!.dataCollection ?? []),
          "voiceCall.terminationReason": detail.terminationReason ?? chat.voiceCall!.terminationReason ?? null,
          title: titleFor(chat.createdAt),
          lastMessageAt: now,
          updatedAt: now,
        },
      }
    );
  } catch (e) {
    if (isDuplicateKey(e)) throw new AibotsInputError("That conversation belongs to another call.");
    throw e;
  }
  if (linked.matchedCount !== 1) throw new AibotsInputError("This call is already linked to a different conversation.");
  await mirrorWebCallUpdate(chat._id, { ...chat.voiceCall!, conversationId, status, durationSecs: detail.durationSecs, transcript: detail.transcript ?? chat.voiceCall!.transcript, hasAudio: detail.hasAudio ?? null, summary: detail.analysis?.summary ?? null, summaryTitle: detail.analysis?.title ?? null, callSuccess: detail.analysis?.callSuccess ?? null, dataCollection: detail.analysis?.data ?? [], terminationReason: detail.terminationReason ?? null }, agentId);
  if (detail.durationSecs && detail.durationSecs > 0 && detail.settled) await meterOnce(chat._id, detail.durationSecs, botName, deps);
}

/**
 * Attaches the finished ElevenLabs conversation to the call's chat: verifies it belongs to this agent and to no other chat, pulls the
 * transcript and duration from ElevenLabs, and counts the seconds once. Safe to call again while ElevenLabs is still processing.
 */
export async function finishVoiceCall(viewer: AibotsViewer, chatId: string, conversationId: string, deps: CallDeps = {}): Promise<VoiceCallView> {
  const chat = await ownCall(viewer, chatId);
  if (typeof conversationId !== "string" || !/^[\w-]{4,128}$/.test(conversationId)) throw new AibotsInputError("That call couldn't be identified.");
  const bot = await getUsableBot(viewer, chat.botId);
  const agentId = bot.voice?.elevenAgentId;
  if (!agentId) throw new NotFoundError();
  const prior = chat.voiceCall!.conversationId;
  if (prior && prior !== conversationId) throw new AibotsInputError("This call is already linked to a different conversation.");
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
  await settleCall(chat, bot.name, agentId, conversationId, client, deps);
  return view((await (await chatsCollection()).findOne({ _id: chat._id }))!, true);
}

/**
 * Finalises the viewer's calls with this agent that the browser never finished (tab closed, network lost): run when they open the
 * agent. Unlinked old calls are matched to the ElevenLabs conversation that started right after them, but only when that match is
 * unambiguous (exactly one unclaimed conversation and one waiting call in the window); calls already linked but still processing, or
 * settled and not yet metered, are pulled again. Never throws; metering stays once-only.
 */
export async function reconcileVoiceCalls(viewer: AibotsViewer, botId: string, deps: CallDeps & { now?: () => Date } = {}): Promise<number> {
  try {
    const bot = await getUsableBot(viewer, botId);
    const agentId = bot.voice?.elevenAgentId;
    if (bot.kind !== "voice" || !agentId) return 0;
    const col = await chatsCollection();
    const now = (deps.now ?? (() => new Date()))();
    const graceMs = Math.max(5 * 60_000, ((bot.voice?.maxDurationSecs ?? 600) + 120) * 1000);
    const cutoff = new Date(now.getTime() - graceMs);
    const mine = { userId: viewer.userId, botId, ...notDeleted };
    const unlinked = await col.find({ ...mine, "voiceCall.status": "started", "voiceCall.conversationId": null, createdAt: { $lte: cutoff } }).sort({ createdAt: 1 }).limit(10).toArray();
    const linked = await col.find({ ...mine, "voiceCall.conversationId": { $type: "string" }, $or: [{ "voiceCall.status": { $in: ["started", "processing"] } }, { "voiceCall.status": { $in: ["done", "failed"] }, "voiceCall.durationSecs": { $gt: 0 }, "voiceCall.meteredAt": null }] }).limit(10).toArray();
    if (!unlinked.length && !linked.length) return 0;
    const client = await (deps.client ?? workspaceAgentClient)();
    if (!client) return 0;
    let settled = 0;
    for (const chat of linked) {
      await settleCall(chat, bot.name, agentId, chat.voiceCall!.conversationId!, client, deps).then(() => settled++, () => {});
    }
    if (unlinked.length) {
      const recent = (await client.listConversations(agentId, { pageSize: 100 }).catch(() => null))?.items ?? [];
      const claimed = new Set((await col.find({ "voiceCall.conversationId": { $in: recent.map((c) => c.conversationId) } }, { projection: { "voiceCall.conversationId": 1 } }).toArray()).map((c) => c.voiceCall?.conversationId));
      const waiting = await col.find({ botId, "voiceCall.status": "started", "voiceCall.conversationId": null, ...notDeleted }).toArray(); // every user's, to keep the match unambiguous
      for (const chat of unlinked) {
        const from = chat.createdAt.getTime() - 10_000;
        const to = chat.createdAt.getTime() + 5 * 60_000;
        const inWindow = (t: number) => t >= from && t <= to;
        const candidates = recent.filter((c) => c.conversationId && !claimed.has(c.conversationId) && c.startedAt && inWindow(new Date(c.startedAt).getTime()));
        const rivals = waiting.filter((w) => w._id !== chat._id && Math.abs(w.createdAt.getTime() - chat.createdAt.getTime()) <= 5 * 60_000);
        if (candidates.length !== 1 || rivals.length > 0) continue;
        claimed.add(candidates[0].conversationId);
        await settleCall(chat, bot.name, agentId, candidates[0].conversationId, client, deps).then(() => settled++, () => {});
      }
    }
    return settled;
  } catch (e) {
    console.error("[agentos voice] reconcile failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** The viewer's own calls with one agent, newest first (transcripts load on open). */
export async function listVoiceCalls(viewer: AibotsViewer, botId: string, limit = 50): Promise<VoiceCallView[]> {
  const col = await chatsCollection();
  const rows = await col.find({ userId: viewer.userId, botId, voiceCall: { $exists: true }, ...notDeleted }).sort({ createdAt: -1 }).limit(limit).toArray();
  return rows.map((c) => view(c, false));
}

export async function getVoiceCall(viewer: AibotsViewer, chatId: string): Promise<VoiceCallView> {
  const chat = await ownCall(viewer, chatId, { oversight: true });
  // Reading someone else's call is oversight: log it like a text chat opened by an admin (once per half hour per call).
  if (chat.userId !== viewer.userId) {
    await recordAuditThrottled({ actorId: viewer.userId, actorEmail: viewer.email, action: "view", entity: "chat", entityId: chat._id, entityLabel: chat.title, botId: chat.botId, summary: `Voice call of ${chat.userEmail}` }, 30 * 60 * 1000);
  }
  return view(chat, true);
}

/** Pulls the transcript again for a call ElevenLabs was still processing when it ended. */
export async function refreshVoiceCall(viewer: AibotsViewer, chatId: string, deps: CallDeps = {}): Promise<VoiceCallView> {
  const chat = await ownCall(viewer, chatId);
  const id = chat.voiceCall!.conversationId;
  if (!id) throw new AibotsInputError("This call never connected, so there is no transcript.");
  return finishVoiceCall(viewer, chatId, id, deps);
}
