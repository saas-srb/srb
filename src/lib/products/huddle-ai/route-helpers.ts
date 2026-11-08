import "server-only";
import { getCurrentChatUser, type CurrentChatUser } from "@/lib/messenger-auth";
import { isChatAdmin } from "@/lib/messenger-roles";
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

export async function resolveScope(
  scopeType: unknown,
  scopeId: unknown,
  user?: CurrentChatUser
): Promise<ResolvedScope> {
  const u = user ?? (await requireSession());

  if ((scopeType !== "channel" && scopeType !== "dm") || typeof scopeId !== "string" || !scopeId) {
    throw new HttpError(400, "Missing or invalid conversation.");
  }

  if (scopeType === "channel") {
    const channel = await getChannel(scopeId);
    if (!channel) throw new HttpError(404, "Channel not found.");
    const canRead = await canAccessChannel(channel, u);
    if (!canRead) throw new HttpError(403, "You don't have access to this channel.");
    const canPost = await canPostInChannel(channel, u);
    const membership = await getMembership(channel._id, u.id);
    const isModerator =
      isChatAdmin(u) || membership?.role === "owner" || membership?.role === "admin";
    return { user: u, scope: { type: "channel", id: channel._id }, channel, conversation: null, canRead, canPost, isModerator };
  }

  const conversation = await getConversation(scopeId);
  if (!conversation) throw new HttpError(404, "Conversation not found.");
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
