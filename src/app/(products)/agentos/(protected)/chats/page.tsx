import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, SectionCard } from "@/components/products/agentos/AibotsUi";
import AibotsFilterBar from "@/components/products/agentos/AibotsFilterBar";
import ActionButton from "@/components/products/agentos/ActionButton";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { listAllBots, GENERAL_BOT_ID, GENERAL_BOT_NAME } from "@/lib/products/agentos/bots";
import { listAllChats } from "@/lib/products/agentos/chats";
import { deleteChatAction } from "@/app/(products)/agentos/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

/** Read-only oversight of every user's chats (VIEW_CHATS). Transcripts open at /agentos/chats/[id]. */
export default async function AllChatsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  if (!can(viewer, "VIEW_CHATS")) redirect("/agentos");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const [bots, result] = await Promise.all([listAllBots(), listAllChats({ botId: sp.bot || undefined, q: sp.q || undefined, page })]);
  const botName = new Map([[GENERAL_BOT_ID, GENERAL_BOT_NAME], ...bots.map((b) => [b._id, b.name] as [string, string])]);
  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    qs.set("page", String(p));
    return `/agentos/chats?${qs.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="All Chats" crumbs={[{ label: "All Chats" }]} description={`${result.total} chat${result.total === 1 ? "" : "s"} across every user and bot. Opening one is read-only.`} />
      <AibotsFilterBar
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Chat title or user email" },
          { key: "bot", label: "Bot", type: "select", options: [{ value: GENERAL_BOT_ID, label: GENERAL_BOT_NAME }, ...bots.map((b) => ({ value: b._id, label: b.name }))], allLabel: "All bots" },
        ]}
        values={{ q: sp.q ?? "", bot: sp.bot ?? "" }}
      />
      <SectionCard title="Chats">
        {result.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No chats match.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {result.items.map((c) => (
              <li key={c._id} className="flex items-center gap-3 py-2">
                <Link href={`/agentos/chats/${c._id}`} className="min-w-0 flex-1 hover:text-primary">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {botName.get(c.botId) ?? "Deleted bot"} · {c.userEmail} · {c.turns} message{c.turns === 1 ? "" : "s"} · {formatDateTime(c.lastMessageAt)}
                  </p>
                </Link>
                {can(viewer, "DELETE_CHATS") && (
                  <ActionButton variant="ghost" size="icon-xs" aria-label={`Delete ${c.title}`} action={deleteChatAction.bind(null, c._id)} success="Chat deleted" confirm={{ title: "Delete this chat?", description: `“${c.title}” by ${c.userEmail} and its OpenAI conversation will be permanently deleted.`, confirmLabel: "Delete" }}>
                    <Trash2 className="size-3.5" />
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {result.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {result.totalPages}</span>
          <div className="flex gap-2">
            <Link href={pageHref(Math.max(page - 1, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}><ChevronLeft className="size-3.5" />Previous</Link>
            <Link href={pageHref(Math.min(page + 1, result.totalPages))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page >= result.totalPages} tabIndex={page >= result.totalPages ? -1 : undefined}>Next<ChevronRight className="size-3.5" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
