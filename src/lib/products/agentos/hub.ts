import "server-only";
import { botsCollection, canUseBot, kindOf, normalizeBot, toSummary, usableAgentsFilter } from "@/lib/products/agentos/bots";
import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import { chatsCollection, type ChatDoc } from "@/lib/products/agentos/chats";
import { GENERAL_BOT_ID } from "@/lib/products/agentos/constants";
import { newId, notDeleted } from "@/lib/products/agentos/db";
import { can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import type { HubAgent } from "@/lib/products/agentos/hub-filter";

/**
 * Agent Hub + sidebar data. "Agents" = the bots collection, text and voice alike.
 *  - Hub: everything the viewer may open (editors also see inactive agents so they can fix or re-enable them).
 *  - Sidebar: ONLY agents this viewer has actually chatted or talked with, most recently used first.
 * What links a chat to an agent is `aibots_chats.botId` (the voice module records its calls through `recordVoiceSession`).
 */

/** The last time each of this viewer's agents was used, from their own chats. */
async function lastUsedByAgent(viewer: AibotsViewer): Promise<Map<string, Date>> {
  const col = await chatsCollection();
  const rows = await col
    .aggregate<{ _id: string; last: Date }>([
      { $match: { userId: viewer.userId, ...notDeleted } },
      { $group: { _id: "$botId", last: { $max: "$lastMessageAt" } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.last]));
}

export async function listHubAgents(viewer: AibotsViewer): Promise<HubAgent[]> {
  const col = await botsCollection();
  const filter = can(viewer, "EDIT_BOT") ? notDeleted : usableAgentsFilter(viewer);
  const [rows, used] = await Promise.all([col.find(filter).sort({ name: 1 }).limit(500).toArray(), lastUsedByAgent(viewer)]);
  const editor = can(viewer, "EDIT_BOT");
  return rows.map(normalizeBot).map((b) => ({
    ...toSummary(b),
    voiceName: b.voice?.voiceName ?? null,
    lastUsedAt: used.get(b._id)?.toISOString() ?? null,
    canEdit: editor,
  }));
}

export interface SidebarAgent {
  _id: string;
  name: string;
  icon: string;
  color: string;
  avatarUrl: string | null;
  kind: "text" | "voice";
}

/** Agents the viewer has used, newest first, capped. Agents they can no longer open (deleted, inactive, access removed) drop out. */
export async function listRecentAgents(viewer: AibotsViewer, limit = 8): Promise<{ agents: SidebarAgent[]; total: number }> {
  const chats = await chatsCollection();
  const recent = await chats
    .aggregate<{ _id: string; last: Date }>([
      { $match: { userId: viewer.userId, botId: { $ne: GENERAL_BOT_ID }, ...notDeleted } },
      { $group: { _id: "$botId", last: { $max: "$lastMessageAt" } } },
      { $sort: { last: -1 } },
      { $limit: 200 },
    ])
    .toArray();
  if (recent.length === 0) return { agents: [], total: 0 };
  const col = await botsCollection();
  const bots = await col.find({ _id: { $in: recent.map((r) => r._id) }, ...notDeleted }).toArray();
  const byId = new Map(bots.map((b) => [b._id, b]));
  const usable = recent
    .map((r) => byId.get(r._id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b) && canUseBot(viewer, b!) && (b!.status === "active" || can(viewer, "EDIT_BOT")));
  return {
    total: usable.length,
    agents: usable.slice(0, limit).map((b) => ({ _id: b._id, name: b.name, icon: b.icon, color: b.color, avatarUrl: avatarUrlFor(b._id, b.avatarKey), kind: kindOf(b) })),
  };
}

/**
 * Records one voice conversation as a chat row (no OpenAI conversation) so the agent shows in the sidebar and the Hub's
 * "last used". Called by the voice module when a call starts. Returns the chat id.
 */
export async function recordVoiceSession(viewer: AibotsViewer, botId: string, title = "Voice conversation"): Promise<string> {
  const now = new Date();
  const chat: ChatDoc = {
    _id: newId(),
    botId,
    userId: viewer.userId,
    userEmail: viewer.email,
    title,
    titleLocked: true,
    conversationId: null,
    turns: 0,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await (await chatsCollection()).insertOne(chat);
  return chat._id;
}

