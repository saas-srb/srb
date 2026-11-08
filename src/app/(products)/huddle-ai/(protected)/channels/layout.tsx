import { getCurrentChatUser } from "@/lib/messenger-auth";
import { listMemberChannels, serializeChannel } from "@/lib/products/huddle-ai/channels";
import { canCreateTeamChannel } from "@/lib/messenger-roles";
import { listDirectoryUsers } from "@/lib/products/huddle-ai/users";
import ConversationList, { type ConversationRow } from "@/components/products/huddle-ai/ConversationList";
import CreateChannelButton from "@/components/products/huddle-ai/CreateChannelButton";

export const dynamic = "force-dynamic";

export default async function ChannelsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentChatUser();
  if (!user) return null;

  const channels = await listMemberChannels(user.id, "team");
  const serialized = await Promise.all(channels.map((c) => serializeChannel(c, user.id)));
  const directory = await listDirectoryUsers(user.id);

  const rows: ConversationRow[] = serialized.map((c) => ({
    href: `/huddle-ai/channels/${c.slug}`,
    key: c._id,
    title: c.name,
    subtitle: c.lastMessagePreview ?? c.description,
    timestamp: c.lastActivityAt,
    unread: c.unread,
    channelVisibility: c.visibility,
    kind: "channel",
  }));

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-border/40 bg-background/95 backdrop-blur-md dark:bg-card/85">
      <aside className="hidden w-72 shrink-0 border-r border-border/60 sm:block">
        <ConversationList
          rows={rows}
          header="Team Channels"
          emptyLabel="You haven't joined any channels yet. Browse below."
          action={
            canCreateTeamChannel(user) ? (
              <CreateChannelButton
                users={directory.map((u) => ({ _id: u._id, displayName: u.displayName, title: u.title, department: u.department }))}
              />
            ) : null
          }
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
