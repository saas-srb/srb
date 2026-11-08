import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Hash, Users } from "lucide-react";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { listBrowsableChannels, listMemberIds } from "@/lib/products/huddle-ai/channels";
import JoinChannelButton from "@/components/products/huddle-ai/JoinChannelButton";

export const dynamic = "force-dynamic";

export default async function ChannelsIndexPage() {
  const user = await getCurrentChatUser();
  if (!user) return null;

  const browsable = await listBrowsableChannels(user.id);
  const counts = await Promise.all(browsable.map((c) => listMemberIds(c._id).then((m) => m.length)));

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
        <PanelPageHeader title={<>Browse channels</>} description={<>Public channels anyone can join. Pick one from the left once you&apos;re in.</>} />

        <PanelListFilters>
{browsable.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
            <Hash className="mx-auto mb-2 size-6 opacity-40" />
            You&apos;re in every public channel already.
          </div>
        ) : (
          <ul className="space-y-2">
            {browsable.map((c, i) => (
              <li
                key={c._id}
                className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Hash className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.description ?? "No description"} · <Users className="inline size-3" /> {counts[i]}
                  </p>
                </div>
                <JoinChannelButton slug={c.slug} />
              </li>
            ))}
          </ul>
        )}
</PanelListFilters>
      </div>
    </div>
  );
}
