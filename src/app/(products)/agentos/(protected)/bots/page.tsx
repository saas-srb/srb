import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Plus, Pencil, MessageSquare, Trash2, Users, Globe2 } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/products/agentos/AibotsUi";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import ActionButton from "@/components/products/agentos/ActionButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { listAllBots } from "@/lib/products/agentos/bots";
import { countFilesByBot } from "@/lib/products/agentos/knowledge";
import { chatsCollection } from "@/lib/products/agentos/chats";
import { notDeleted } from "@/lib/products/agentos/db";
import { deleteBotAction, setBotStatusAction } from "@/app/(products)/agentos/(protected)/actions";
import { formatDate } from "@/lib/utils";

export default async function ManageBotsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const mayEdit = can(viewer, "EDIT_BOT");
  const mayKb = can(viewer, "MANAGE_KB") || can(viewer, "UPLOAD_FILES") || can(viewer, "DELETE_FILES");
  if (!mayEdit && !mayKb && !can(viewer, "DELETE_BOT")) redirect("/agentos");

  const [bots, fileCounts, chatCounts] = await Promise.all([
    listAllBots(),
    countFilesByBot(),
    chatsCollection().then((c) => c.aggregate<{ _id: string; n: number }>([{ $match: notDeleted }, { $group: { _id: "$botId", n: { $sum: 1 } } }]).toArray()),
  ]);
  const chatsBy = new Map(chatCounts.map((r) => [r._id, r.n]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Manage Bots"
        crumbs={[{ label: "Manage Bots" }]}
        description={`${bots.length} bot${bots.length === 1 ? "" : "s"} · ${bots.filter((b) => b.status === "active").length} active. Every bot runs on the same workspace — configuration only.`}
        actions={
          can(viewer, "CREATE_BOT") && (
            <Button nativeButton={false} render={<Link href="/agentos/bots/new" />}>
              <Plus className="size-4" /> Create Bot
            </Button>
          )
        }
      />
      <PanelListFilters>
<SectionCard title="All bots">
        {bots.length === 0 ? (
          <EmptyState icon={<Bot className="size-5" />} title="No bots yet">
            Create a bot, give it instructions and a knowledge base, and it shows up in everyone&apos;s sidebar.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-semibold">Bot</th>
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 font-semibold">Access</th>
                  <th className="px-3 py-2 text-right font-semibold">Files</th>
                  <th className="px-3 py-2 text-right font-semibold">Chats</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="py-2 pl-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {bots.map((b) => (
                  <tr key={b._id}>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-3">
                        <BotAvatar icon={b.icon} color={b.color} imageUrl={avatarUrlFor(b._id, b.avatarKey)} />
                        <div className="min-w-0">
                          <Link href={`/agentos/bots/${b._id}${mayEdit ? "" : "?tab=knowledge"}`} className="font-semibold hover:text-primary">
                            {b.name}
                          </Link>
                          <p className="max-w-80 truncate text-[11px] text-muted-foreground">
                            {b.category} · updated {formatDate(b.updatedAt)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{b.model}</td>
                    <td className="px-3 py-2 text-xs">
                      {b.access.mode === "all" ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Globe2 className="size-3.5" /> Everyone
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" /> {b.access.roles.length} role{b.access.roles.length === 1 ? "" : "s"}, {b.access.userIds.length} {b.access.userIds.length === 1 ? "person" : "people"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fileCounts.get(b._id) ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{chatsBy.get(b._id) ?? 0}</td>
                    <td className="px-3 py-2">
                      {b.status === "active" ? <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Active</Badge> : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                    </td>
                    <td className="py-2 pl-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {mayEdit && (
                          <ActionButton variant="ghost" size="xs" action={setBotStatusAction.bind(null, b._id, b.status !== "active")} success={b.status === "active" ? `${b.name} deactivated — removed from the sidebar` : `${b.name} activated`}>
                            {b.status === "active" ? "Deactivate" : "Activate"}
                          </ActionButton>
                        )}
                        {mayEdit && (
                          <Button size="icon-xs" variant="ghost" nativeButton={false} render={<Link href={`/agentos/b/${b._id}`} />} aria-label={`Test chat with ${b.name}`}>
                            <MessageSquare className="size-3.5" />
                          </Button>
                        )}
                        <Button size="icon-xs" variant="ghost" nativeButton={false} render={<Link href={`/agentos/bots/${b._id}${mayEdit ? "" : "?tab=knowledge"}`} />} aria-label={`Edit ${b.name}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                        {can(viewer, "DELETE_BOT") && (
                          <ActionButton
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Delete ${b.name}`}
                            action={deleteBotAction.bind(null, b._id)}
                            success={`${b.name} deleted`}
                            confirm={{ title: `Delete ${b.name}?`, description: "The bot disappears for everyone, and its knowledge files and OpenAI vector store are deleted. Existing chats stay in the log but can no longer be continued. This can't be undone.", confirmLabel: "Delete bot" }}
                          >
                            <Trash2 className="size-3.5" />
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
</PanelListFilters>
    </div>
  );
}
