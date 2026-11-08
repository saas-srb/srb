import { getCurrentChatUser } from "@/lib/messenger-auth";
import { listConversationsForUser, serializeConversations } from "@/lib/products/huddle-ai/conversations";
import { getPresence } from "@/lib/products/huddle-ai/presence";
import ConversationList, { type ConversationRow } from "@/components/products/huddle-ai/ConversationList";
import NewDmButton from "@/components/products/huddle-ai/NewDmButton";
import { listDirectoryUsers } from "@/lib/products/huddle-ai/users";

export const dynamic = "force-dynamic";

export default async function DmLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentChatUser();
  if (!user) return null;

  const conversations = await listConversationsForUser(user.id);
  const serialized = await serializeConversations(conversations, user.id);
  const presence = await getPresence(serialized.map((c) => c.otherUser?._id ?? "").filter(Boolean));
  const directory = await listDirectoryUsers(user.id);

  const rows: ConversationRow[] = serialized.map((c) => ({
    href: `/huddle-ai/dm/${c._id}`,
    key: c._id,
    title: c.otherUser?.displayName ?? "Unknown",
    subtitle:
      c.lastMessagePreview
        ? `${c.lastMessageAuthorId === user.id ? "You: " : ""}${c.lastMessagePreview}`
        : c.otherUser?.title ?? null,
    timestamp: c.lastMessageAt,
    unread: c.unread,
    pinned: c.pinned,
    presence: c.otherUser ? presence[c.otherUser._id] ?? "offline" : "offline",
    kind: "dm",
  }));

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-border/40 bg-background/95 backdrop-blur-md dark:bg-card/85">
      <aside className="hidden w-72 shrink-0 border-r border-border/60 sm:block">
        <ConversationList
          rows={rows}
          header="Direct Messages"
          emptyLabel="No conversations yet. Start one →"
          action={<NewDmButton users={directory.map((u) => ({ _id: u._id, displayName: u.displayName, title: u.title, department: u.department }))} />}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
