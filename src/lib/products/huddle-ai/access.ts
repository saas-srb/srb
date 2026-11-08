import "server-only";
import { getDb } from "@/lib/mongodb";
import { scopeKey } from "@/lib/products/huddle-ai/events";
import { isChatAdmin, type ChatRole } from "@/lib/messenger-roles";

/**
 * Resolves the full set of realtime *scopes* a user is allowed to receive
 * events for. Used by the SSE stream (`/api/huddle-ai/stream`) to filter the
 * event log, and by global search to bound the query.
 *
 *   - every channel they are a member of
 *   - every public team channel (they can read those without joining)
 *   - every DM conversation they are a participant in
 *   - their own `user:<id>` scope (personal notifications, presence)
 *   - workspace admins additionally see every non-deleted channel
 */

export interface VisibleScopes {
  channelIds: string[];
  conversationIds: string[];
  scopeKeys: string[];
}

export async function resolveVisibleScopes(user: {
  id: string;
  roles: ChatRole[];
  permissionOverrides?: Record<string, boolean>;
}): Promise<VisibleScopes> {
  const db = await getDb();

  const [memberRows, publicChannels, convRows, callRows] = await Promise.all([
    db.collection<{ channelId: string }>("channel_members").find({ userId: user.id, deletedAt: null }).project<{ channelId: string }>({ channelId: 1 }).toArray(),
    db
      .collection<{ _id: string }>("chat_channels")
      .find(
        isChatAdmin(user)
          ? { deletedAt: null }
          : { kind: "team", visibility: "public", deletedAt: null }
      )
      .project<{ _id: string }>({ _id: 1 })
      .toArray(),
    db
      .collection<{ _id: string; participantIds: string[] }>("direct_conversations")
      .find({ participantIds: user.id })
      .project<{ _id: string; participantIds: string[] }>({ _id: 1, participantIds: 1 })
      .toArray(),
    db
      .collection<{ callId: string }>("call_participants")
      .find({ userId: user.id, state: { $in: ["ringing", "joined"] } })
      .project<{ callId: string }>({ callId: 1 })
      .toArray(),
  ]);

  const channelIds = Array.from(new Set([...memberRows.map((r) => r.channelId), ...publicChannels.map((r) => r._id)]));
  const conversationIds = convRows.map((r) => r._id);

  // Subscribe to the `user:` scope of everyone we hold a DM with, so their
  // presence changes stream in live. (Channel-member presence updates on the
  // periodic list refresh / navigation — not worth the scope-list bloat.)
  const dmPartnerIds = Array.from(
    new Set(convRows.flatMap((c) => c.participantIds).filter((id) => id !== user.id))
  );

  const callIds = Array.from(new Set(callRows.map((r) => r.callId)));

  const scopeKeys = [
    scopeKey({ type: "user", id: user.id }),
    ...dmPartnerIds.map((id) => scopeKey({ type: "user", id })),
    ...channelIds.map((id) => scopeKey({ type: "channel", id })),
    ...conversationIds.map((id) => scopeKey({ type: "dm", id })),
    ...callIds.map((id) => scopeKey({ type: "call", id })),
  ];

  return { channelIds, conversationIds, scopeKeys };
}
