import "server-only";
import { getCurrentChatUser, type CurrentChatUser } from "@/lib/messenger-auth";
import { canModerateAll, chatCan } from "@/lib/messenger-access";
import {
  getChannel,
  getMembership,
  canAccessChannel,
  canPostInChannel,
  type Channel,
} from "@/lib/products/huddle-ai/channels";
import { getConversation, isParticipant, type DirectConversation } from "@/lib/products/huddle-ai/conversations";
import type { MessageScope } from "@/lib/products/huddle-ai/messages";

/**
 * Shared guard for every Messenger route handler / server action that operates
 * on a conversation. Resolves `{ scopeType, scopeId }` from the request into a
 * concrete channel / DM, re-checking membership every time — page-level gating
 * is never trusted as the security boundary.
 */

export interface ResolvedScope {
  user: CurrentChatUser;
  scope: MessageScope;
  channel: Channel | null;
  conversation: DirectConversation | null;
  canRead: boolean;
  canPost: boolean;
  /** Author can always delete own; a moderator can delete anyone's in a channel. */
  isModerator: boolean;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireSession(): Promise<CurrentChatUser> {
  const user = await getCurrentChatUser();
  if (!user) throw new HttpError(401, "Not signed in.");
  return user;
}

/** The signed-in user when they hold the micro feature `key`, else a 403 (the 401 comes from `requireSession`). */
export async function requireSessionFor(key: string): Promise<CurrentChatUser> {
  const user = await requireSession();
  if (!chatCan(user, key)) throw new HttpError(403, "You don't have access to this.");
  return user;
}

const VIEW_KEY: Record<string, string> = { team: "channels.view", project: "projects.view", group: "groups.view" };

/**
 * `need` = "send" (the default, the stricter choice) also needs `messages.send`; "read" only needs the feature that opens that kind of conversation
 * (direct messages, team channels, project channels or group chats).
 */
export async function resolveScope(
  scopeType: unknown,
  scopeId: unknown,
  user?: CurrentChatUser,
  need: "read" | "send" = "send"
): Promise<ResolvedScope> {
  const u = user ?? (await requireSession());
  if (need === "send" && !chatCan(u, "messages.send")) throw new HttpError(403, "You don't have access to send here.");

  if ((scopeType !== "channel" && scopeType !== "dm") || typeof scopeId !== "string" || !scopeId) {
    throw new HttpError(400, "Missing or invalid conversation.");
  }

  if (scopeType === "channel") {
    const channel = await getChannel(scopeId);
    if (!channel) throw new HttpError(404, "Channel not found.");
    if (!chatCan(u, VIEW_KEY[channel.kind] ?? "channels.view")) throw new HttpError(403, "You don't have access to this kind of conversation.");
    const canRead = await canAccessChannel(channel, u);
    if (!canRead) throw new HttpError(403, "You don't have access to this channel.");
    const canPost = await canPostInChannel(channel, u);
    const membership = await getMembership(channel._id, u.id);
    const isModerator =
      canModerateAll(u) || membership?.role === "owner" || membership?.role === "admin";
    return { user: u, scope: { type: "channel", id: channel._id }, channel, conversation: null, canRead, canPost, isModerator };
  }

  const conversation = await getConversation(scopeId);
  if (!conversation) throw new HttpError(404, "Conversation not found.");
  if (!chatCan(u, "dm.view")) throw new HttpError(403, "You don't have access to direct messages.");
  if (!isParticipant(conversation, u.id)) throw new HttpError(403, "You're not part of this conversation.");
  return {
    user: u,
    scope: { type: "dm", id: conversation._id },
    channel: null,
    conversation,
    canRead: true,
    canPost: true,
    isModerator: false,
  };
}

export function jsonError(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Something went wrong.";
  const known = ["Unauthorized", "Forbidden"].includes(message);
  return Response.json({ error: message }, { status: known ? 403 : 400 });
}
