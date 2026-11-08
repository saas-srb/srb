import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { Markdown } from "@/components/chat/Markdown";
import AnnouncementActions, { AcknowledgeButton } from "@/components/products/huddle-ai/AnnouncementActions";
import AnnouncementReadStats from "@/components/products/huddle-ai/AnnouncementReadStats";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import {
  getAnnouncement,
  canViewAnnouncement,
  serializeAnnouncement,
  markAnnouncementRead,
  readStats,
  PRIORITY_META,
} from "@/lib/products/huddle-ai/announcements";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentChatUser();
  if (!user) return null;

  const announcement = await getAnnouncement(id);
  if (!announcement || !(await canViewAnnouncement(announcement, user))) notFound();

  const isAuthor = announcement.authorId === user.id;

  // Reading a published announcement records a read (even without required confirmation).
  if (announcement.status === "published" && !isAuthor) {
    await markAnnouncementRead(id, user.id).catch(() => {});
  }

  const [a, stats] = await Promise.all([
    serializeAnnouncement(announcement, user.id),
    isAuthor && announcement.status === "published" ? readStats(id) : Promise.resolve(null),
  ]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
<PanelPageHeader
            title={<>{a.title}</>}
            description={<>{a.authorName}
            {a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleString()}` : a.scheduledFor ? ` · scheduled for ${new Date(a.scheduledFor).toLocaleString()}` : " · draft"}
            {a.status === "published" ? ` · ${a.recipientCount} recipient${a.recipientCount === 1 ? "" : "s"}` : ""}</>}
          />
<div className="space-y-4">

        <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {a.priority !== "normal" && (
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", PRIORITY_META[a.priority].className)}>
                {PRIORITY_META[a.priority].label}
              </span>
            )}
            <span className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] text-muted-foreground capitalize">
              {a.status}
            </span>
          </div>


          <div className="mt-4 border-t border-border/60 pt-4">
            <Markdown content={a.body} />
          </div>

          {a.attachments.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-border/60 pt-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Attachments</p>
              {a.attachments.map((att) => (
                <a
                  key={att.storageKey}
                  href={`/api/huddle-ai/files/${att.storageKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm hover:border-primary/40"
                >
                  <Paperclip className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{att.filename}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{(att.size / 1024).toFixed(0)} KB</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {!isAuthor && a.status === "published" && a.requireConfirmation && (
          <AcknowledgeButton id={id} done={a.readByMe} />
        )}

        {isAuthor && stats && a.requireConfirmation && (
          <AnnouncementReadStats total={stats.total} read={stats.read} readers={stats.readers} unread={stats.unread} />
        )}

        {isAuthor && <AnnouncementActions id={id} status={a.status} />}
      </div>
</div>
    </div>
  );
}
