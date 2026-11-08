import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Megaphone, Plus, Clock, FileEdit } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { canPostAnnouncements } from "@/lib/messenger-roles";
import { listForViewer, listForAuthor, PRIORITY_META } from "@/lib/products/huddle-ai/announcements";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function excerpt(md: string, n = 180): string {
  return md.replace(/[#*_`>[\]()-]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
}

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentChatUser();
  if (!user) return null;
  const { page } = await searchParams;

  const isAuthor = canPostAnnouncements(user);
  const [feed, mine] = await Promise.all([
    listForViewer(user, { page: page ? Number(page) : 1 }),
    isAuthor ? listForAuthor(user.id, user.id) : Promise.resolve([]),
  ]);
  const drafts = mine.filter((a) => a.status === "draft" || a.status === "scheduled");

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Messenger", href: "/huddle-ai" }, { label: "Announcements" }]}
          title={<>Announcements</>}
          description={<>Broadcast updates from leadership and HR.</>}
          actions={<>{isAuthor && (
            <Button render={<Link href="/huddle-ai/announcements/new" />} size="sm">
              <Plus className="size-3.5" data-icon="inline-start" />
              New announcement
            </Button>
          )}</>}
        />
<PanelListFilters>
<div className="space-y-5">

        {drafts.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase text-muted-foreground">Your drafts &amp; scheduled</h2>
            {drafts.map((a) => (
              <Link
                key={a._id}
                href={`/huddle-ai/announcements/${a._id}/edit`}
                className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-2.5 text-sm hover:border-primary/40"
              >
                {a.status === "scheduled" ? <Clock className="size-4 text-amber-500" /> : <FileEdit className="size-4 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{a.title || "Untitled"}</span>
                <span className="text-xs text-muted-foreground">
                  {a.status === "scheduled" && a.scheduledFor
                    ? `Sends ${new Date(a.scheduledFor).toLocaleString()}`
                    : "Draft"}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {feed.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
              <Megaphone className="mx-auto mb-2 size-6 opacity-40" />
              No announcements yet.
            </div>
          )}
          {feed.items.map((a) => (
            <Link
              key={a._id}
              href={`/huddle-ai/announcements/${a._id}`}
              className="block rounded-2xl border border-border/50 bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{a.title}</h3>
                <span className="flex shrink-0 items-center gap-1.5">
                  {a.priority !== "normal" && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", PRIORITY_META[a.priority].className)}>
                      {PRIORITY_META[a.priority].label}
                    </span>
                  )}
                  {a.requireConfirmation && !a.readByMe && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Confirm</span>
                  )}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{excerpt(a.body)}</p>
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                {a.authorName} · {a.publishedAt ? new Date(a.publishedAt).toLocaleString() : ""}
                {a.attachments.length > 0 ? ` · ${a.attachments.length} attachment${a.attachments.length === 1 ? "" : "s"}` : ""}
              </p>
            </Link>
          ))}
        </div>

        {feed.totalPages > 1 && (
          <div className="flex items-center justify-between text-xs">
            <Button
              render={<Link href={`/huddle-ai/announcements?page=${Math.max(1, feed.page - 1)}`} />}
              size="xs"
              variant="outline"
              disabled={feed.page <= 1}
            >
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {feed.page} of {feed.totalPages}
            </span>
            <Button
              render={<Link href={`/huddle-ai/announcements?page=${feed.page + 1}`} />}
              size="xs"
              variant="outline"
              disabled={feed.page >= feed.totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>
</PanelListFilters>
</div>
    </div>
  );
}
