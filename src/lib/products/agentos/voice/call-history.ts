import "server-only";
import { botsCollection, listAllBots, listUsableBots, toSummary, type BotSummary } from "@/lib/products/agentos/bots";
import { chatsCollection } from "@/lib/products/agentos/chats";
import { recordAuditThrottled } from "@/lib/products/agentos/audit";
import { AibotsInputError, NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { ElevenLabsAgentError } from "@/lib/products/agentos/voice/elevenlabs-agent";
import { NOT_CONFIGURED_MESSAGE, workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import { ownCall, reconcileVoiceCalls, type CallDeps } from "@/lib/products/agentos/voice/calls";
import { CALLS_PAGE_SIZE, buildCallQuery, callState, pageCount, type CallFilters, type CallState } from "@/lib/products/agentos/voice/call-format";

/** The Calls area: list, detail and audio, scoped to the viewer's own calls, or everyone's for people with VIEW_CHATS. */

export interface CallRow {
  chatId: string;
  startedAt: string;
  botId: string;
  bot: BotSummary | null;
  userEmail: string;
  durationSecs: number | null;
  state: CallState;
  hasAudio: boolean;
  hasTranscript: boolean;
  summary: string | null;
  callSuccess: "success" | "failure" | "unknown" | null;
  mine: boolean;
}

export interface CallList {
  items: CallRow[];
  total: number;
  page: number;
  totalPages: number;
  /** True when the list may include other people's calls. */
  oversight: boolean;
  /** Voice agents to filter by. */
  agents: { value: string; label: string }[];
}

/** Calls this viewer started that ElevenLabs may have finished since: completed (and metered) before the list is read. Never throws. */
export async function reconcileMyPendingCalls(viewer: AibotsViewer, deps: CallDeps & { now?: () => Date } = {}): Promise<void> {
  try {
    const col = await chatsCollection();
    const pending = await col
      .find({ userId: viewer.userId, deletedAt: null, "voiceCall.status": { $in: ["started", "processing"] } }, { projection: { botId: 1 } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    const botIds = [...new Set(pending.map((p) => p.botId))].slice(0, 5);
    for (const id of botIds) await reconcileVoiceCalls(viewer, id, deps);
  } catch (e) {
    console.error("[agentos calls] reconcile failed", e instanceof Error ? e.message : e);
  }
}

export async function listCalls(viewer: AibotsViewer, filters: CallFilters): Promise<CallList> {
  const oversight = can(viewer, "VIEW_CHATS");
  const scopeUser = oversight && filters.scope === "all" ? null : viewer.userId;
  const col = await chatsCollection();
  const query = buildCallQuery(filters, scopeUser);
  const page = filters.page;
  const [rows, total, agents] = await Promise.all([
    col
      .find(query, { projection: { "voiceCall.transcript": { $slice: 1 } } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * CALLS_PAGE_SIZE)
      .limit(CALLS_PAGE_SIZE)
      .toArray(),
    col.countDocuments(query),
    oversight ? listAllBots().then((b) => b.filter((x) => x.kind === "voice")) : listUsableBots(viewer).then((b) => b.filter((x) => x.kind === "voice")),
  ]);
  // Deleted agents still show their old calls, so read the rows by id rather than from the usable list.
  const ids = [...new Set(rows.map((r) => r.botId))];
  const botRows = ids.length ? await (await botsCollection()).find({ _id: { $in: ids } }).toArray() : [];
  const byId = new Map(botRows.map((b) => [b._id, toSummary(b)]));
  const items: CallRow[] = rows.map((c) => {
    const v = c.voiceCall!;
    const connected = Boolean(v.conversationId);
    return {
      chatId: c._id,
      startedAt: c.createdAt.toISOString(),
      botId: c.botId,
      bot: byId.get(c.botId) ?? null,
      userEmail: c.userEmail,
      durationSecs: v.durationSecs,
      state: callState({ connected, status: v.status }),
      hasAudio: connected && v.hasAudio === true,
      hasTranscript: Boolean(v.transcript?.length),
      summary: v.summaryTitle || v.summary || null,
      callSuccess: v.callSuccess ?? null,
      mine: c.userId === viewer.userId,
    };
  });
  return { items, total, page, totalPages: pageCount(total), oversight, agents: agents.map((b) => ({ value: b._id, label: b.name })) };
}

// Seeking makes the browser ask for several ranges in a row; keep the last few recordings briefly so each is fetched from ElevenLabs once.
// Authorisation runs on every request BEFORE this is consulted, so the cache never grants access.
const AUDIO_TTL_MS = 3 * 60_000;
const AUDIO_MAX = 6;
const audioCache = new Map<string, { at: number; value: { bytes: ArrayBuffer; contentType: string } }>();
export const clearCallAudioCache = () => audioCache.clear();

/** Audio access: the viewer's own call, or anyone's with VIEW_CHATS (logged like a transcript view). */
export async function getCallAudio(
  viewer: AibotsViewer,
  chatId: string,
  deps: Pick<CallDeps, "client"> = {}
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const chat = await ownCall(viewer, chatId, { oversight: true });
  const conversationId = chat.voiceCall!.conversationId;
  if (!conversationId) throw new NotFoundError();
  if (chat.userId !== viewer.userId) {
    await recordAuditThrottled({ actorId: viewer.userId, actorEmail: viewer.email, action: "view", entity: "chat", entityId: chat._id, entityLabel: chat.title, botId: chat.botId, summary: `Voice call audio of ${chat.userEmail}` }, 30 * 60 * 1000);
  }
  return fetchAudioCached(`${chat._id}:${conversationId}`, conversationId, deps);
}

/** The recording through the short cache. Call only AFTER the caller has been authorised. Shared with the phone-call audio route. */
export async function fetchAudioCached(key: string, conversationId: string, deps: Pick<CallDeps, "client"> = {}): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const hit = audioCache.get(key);
  if (hit && Date.now() - hit.at < AUDIO_TTL_MS) return hit.value;
  const client = await (deps.client ?? workspaceAgentClient)();
  if (!client) throw new AibotsInputError(NOT_CONFIGURED_MESSAGE);
  let audio;
  try {
    audio = await client.getConversationAudio(conversationId);
  } catch (err) {
    throw new AibotsInputError(err instanceof ElevenLabsAgentError ? err.message : "Couldn't load the recording. Try again.");
  }
  if (!audio) throw new NotFoundError();
  for (const [k, v] of audioCache) if (Date.now() - v.at >= AUDIO_TTL_MS) audioCache.delete(k);
  while (audioCache.size >= AUDIO_MAX) audioCache.delete(audioCache.keys().next().value!);
  audioCache.set(key, { at: Date.now(), value: audio });
  return audio;
}
