import "server-only";
import { searchUsers } from "@/lib/products/huddle-ai/users";
import { searchMessages } from "@/lib/products/huddle-ai/messages";
import { getChannel } from "@/lib/products/huddle-ai/channels";
import { resolveVisibleScopes } from "@/lib/products/huddle-ai/access";
import { getDb } from "@/lib/mongodb";
import { isChatAdmin, type ChatRole } from "@/lib/messenger-roles";

/**
 * Global enterprise search. Every result is bounded to what the caller may
 * already see — channels they belong to (or public ones), DMs they are in,
 * and the user directory. Files / projects / groups are wired for later
 * phases and return empty for now.
 */

export type SearchType = "messages" | "channels" | "users" | "files" | "projects" | "groups";

export interface GlobalSearchResults {
  messages: {
    _id: string;
    scopeType: "channel" | "dm";
    scopeId: string;
    scopeLabel: string;
    authorName: string;
    body: string;
    createdAt: string;
  }[];
  channels: { _id: string; slug: string; name: string; kind: string; description: string | null; memberCount: number }[];
  users: { _id: string; displayName: string; email: string; title: string | null; department: string | null }[];
  files: never[];
  projects: never[];
  groups: never[];
}

export async function globalSearch(
  q: string,
  user: { id: string; roles: ChatRole[]; permissionOverrides?: Record<string, boolean> },
  opts: { types?: SearchType[]; limit?: number } = {}
): Promise<GlobalSearchResults> {
  const term = q.trim();
  const types = new Set<SearchType>(opts.types ?? ["messages", "channels", "users"]);
  const limit = opts.limit ?? 20;

  const empty: GlobalSearchResults = { messages: [], channels: [], users: [], files: [], projects: [], groups: [] };
  if (!term) return empty;

  const scopes = await resolveVisibleScopes(user);
  const db = await getDb();

  const [messageHits, channelHits, userHits] = await Promise.all([
    types.has("messages")
      ? searchMessages(term, { channelIds: scopes.channelIds, conversationIds: scopes.conversationIds, limit })
      : Promise.resolve([]),
    types.has("channels")
      ? (async () => {
          const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          const filter: Record<string, unknown> = isChatAdmin(user)
            ? { deletedAt: null, $or: [{ name: rx }, { slug: rx }, { description: rx }] }
            : { deletedAt: null, $or: [{ name: rx }, { slug: rx }, { description: rx }], $and: [{ $or: [{ _id: { $in: scopes.channelIds } }, { visibility: "public", kind: "team" }] }] };
          return db.collection<{ _id: string; slug: string; name: string; kind: string; description: string | null }>("chat_channels").find(filter).limit(limit).toArray();
        })()
      : Promise.resolve([]),
    types.has("users") ? searchUsers(term, limit) : Promise.resolve([]),
  ]);

  const memberCounts = await Promise.all(
    channelHits.map((c) => db.collection("channel_members").countDocuments({ channelId: c._id, deletedAt: null }))
  );

  return {
    messages: messageHits.map((m) => ({
      _id: m._id,
      scopeType: m.scope.type,
      scopeId: m.scope.id,
      scopeLabel: m.scopeLabel,
      authorName: m.authorName,
      body: m.body,
      createdAt: m.createdAt,
    })),
    channels: channelHits.map((c, i) => ({
      _id: c._id,
      slug: c.slug,
      name: c.name,
      kind: c.kind,
      description: c.description,
      memberCount: memberCounts[i],
    })),
    users: userHits.map((u) => ({
      _id: u._id,
      displayName: u.displayName,
      email: u.email,
      title: u.title,
      department: u.department,
    })),
    files: [],
    projects: [],
    groups: [],
  };
}

export async function resolveMessagePermalink(
  scopeType: "channel" | "dm",
  scopeId: string
): Promise<string> {
  if (scopeType === "dm") return `/huddle-ai/dm/${scopeId}`;
  const channel = await getChannel(scopeId);
  return channel ? `/huddle-ai/channels/${channel.slug}` : "/huddle-ai/channels";
}
