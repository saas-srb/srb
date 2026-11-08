import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Copy, Pencil, Archive, ArchiveRestore, Trash2, CalendarClock, CalendarX, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionCard, Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import { PlatformChip, StatusBadge, KindChip } from "@/components/products/viralpulse-ai/SmmsBits";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import InputDialogButton from "@/components/products/viralpulse-ai/InputDialogButton";
import GenerateBar from "@/components/products/viralpulse-ai/GenerateBar";
import PostEditor from "@/components/products/viralpulse-ai/PostEditor";
import PublishPanel from "@/components/products/viralpulse-ai/PublishPanel";
import PublishTracker from "@/components/products/viralpulse-ai/post-wizard/PublishTracker";
import VersionHistory from "@/components/products/viralpulse-ai/VersionHistory";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getPost } from "@/lib/products/viralpulse-ai/posts";
import { getCampaign } from "@/lib/products/viralpulse-ai/campaigns";
import { getMediaMany, getMedia, toMediaCard } from "@/lib/products/viralpulse-ai/media";
import { listVersions } from "@/lib/products/viralpulse-ai/generations";
import { getBrandSnapshot } from "@/lib/products/viralpulse-ai/brand";
import { connectedPlatforms } from "@/lib/products/viralpulse-ai/integrations";
import { isOpenAIConfigured } from "@/lib/openai";
import { defaultScheduleInput } from "@/lib/products/viralpulse-ai/page-data";
import { formatDateTime } from "@/lib/utils";
import { approvePostAction, archivePostAction, deletePostAction, duplicatePostAction, generatePostAction, schedulePostAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";

export const maxDuration = 300;

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "MANAGE_POSTS") && !can(viewer, "VIEW_CAMPAIGNS")) redirect("/viralpulse-ai");
  const { id } = await params;
  const p = await getPost(id);
  if (!p) notFound();
  const [media, thumb, versions, brand, connected, campaign] = await Promise.all([
    getMediaMany(p.mediaIds),
    p.thumbnailId ? getMedia(p.thumbnailId) : null,
    listVersions("post", id),
    getBrandSnapshot(),
    connectedPlatforms(),
    p.campaignId ? getCampaign(p.campaignId) : null,
  ]);
  const archived = p.status === "archived";
  const canEdit = can(viewer, "MANAGE_POSTS") && !archived && p.status !== "published";
  const hasContent = Boolean(p.idea || p.variants.some((v) => v.content));
  const canSchedule = can(viewer, "SCHEDULE_POSTS") && !archived && p.status !== "published";
  const canPublish = can(viewer, "PUBLISH_CONTENT");

  return (
    <div className="space-y-4">
      <PageHeader
        title={p.title}
        crumbs={[{ label: "Social Media Reels/Posts", href: "/viralpulse-ai/posts" }, { label: p.title }]}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={p.status} />
            <KindChip kind={p.contentType} />
            {p.platforms.map((x) => <PlatformChip key={x} platform={x} />)}
            {campaign && <Link href={`/viralpulse-ai/campaigns/${campaign._id}`} className="text-primary hover:underline">{`· ${campaign.name}`}</Link>}
          </span>
        }
        actions={
          <>
            {can(viewer, "MANAGE_POSTS") && !archived && <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/viralpulse-ai/posts/${id}/edit`} />}><Pencil className="size-3.5" /> Edit post</Button>}
            {can(viewer, "MANAGE_POSTS") && <ActionButton action={duplicatePostAction.bind(null, id)} success="Duplicated" redirectPrefix="/viralpulse-ai/posts/"><Copy className="size-3.5" /> Duplicate</ActionButton>}
            {canSchedule && (
              <InputDialogButton
                variant={p.status === "scheduled" ? "outline" : "default"}
                title={p.status === "scheduled" ? "Reschedule post" : "Schedule post"}
                description={canPublish ? "Approved posts publish automatically at this time to every connected platform. Unapproved ones wait for someone with Publish." : "Scheduled posts publish only after someone with Publish approves them."}
                inputLabel="Publish date & time"
                inputType="datetime-local"
                defaultValue={defaultScheduleInput(p.scheduledAt, p.plannedAt)}
                required
                checkbox={canPublish ? { label: "Approve for automatic publishing", defaultChecked: true } : undefined}
                submitLabel="Schedule"
                success="Scheduled"
                action={schedulePostAction.bind(null, id)}
              >
                <CalendarClock className="size-3.5" /> {p.status === "scheduled" ? "Reschedule" : "Schedule"}
              </InputDialogButton>
            )}
            {canSchedule && p.status === "scheduled" && <ActionButton action={schedulePostAction.bind(null, id, null, false)} success="Unscheduled"><CalendarX className="size-3.5" /> Unschedule</ActionButton>}
            {canPublish && p.status === "scheduled" && (p.approvedBy ? (
              <ActionButton action={approvePostAction.bind(null, id, false)} success="Approval withdrawn"><ShieldOff className="size-3.5" /> Withdraw approval</ActionButton>
            ) : (
              <ActionButton variant="default" action={approvePostAction.bind(null, id, true)} success="Approved — it will publish at the scheduled time"><ShieldCheck className="size-3.5" /> Approve</ActionButton>
            ))}
            {can(viewer, "MANAGE_POSTS") && (archived ? (
              <ActionButton action={archivePostAction.bind(null, id, false)} success="Restored"><ArchiveRestore className="size-3.5" /> Restore</ActionButton>
            ) : (
              <ActionButton action={archivePostAction.bind(null, id, true)} success="Archived"><Archive className="size-3.5" /> Archive</ActionButton>
            ))}
            {can(viewer, "MANAGE_POSTS") && (
              <ActionButton variant="destructive" aria-label="Delete post" action={deletePostAction.bind(null, id)} success="Post deleted" redirectTo="/viralpulse-ai/posts" confirm={{ title: "Delete this post?", description: `“${p.title}” will be removed. Its media stays in the library.`, confirmLabel: "Delete" }}>
                <Trash2 className="size-3.5" />
              </ActionButton>
            )}
          </>
        }
      />
      {p.status === "scheduled" && p.scheduledAt && (
        <Notice tone={p.approvedBy ? "ok" : "warn"}>
          {p.approvedBy ? `Scheduled for ${formatDateTime(p.scheduledAt)} and approved — it will publish automatically to connected platforms. Editing it withdraws the approval.` : `Scheduled for ${formatDateTime(p.scheduledAt)} but not approved yet — it won't publish until someone with Publish approves it.`}
        </Notice>
      )}
      {archived && <Notice tone="warn">Archived — restore it to edit or schedule.</Notice>}
      {p.status === "published" && <Notice tone="ok">{`Published${p.publishedAt ? ` ${formatDateTime(p.publishedAt)}` : ""}. Content is locked as a record of what went out — duplicate to reuse it.`}</Notice>}

      <GenerateBar
        hasContent={hasContent}
        label="Generate all platform versions"
        generate={generatePostAction.bind(null, id)}
        disabled={!canEdit || !can(viewer, "GENERATE_AI_CONTENT") || !(await isOpenAIConfigured())}
        disabledReason={!(await isOpenAIConfigured()) ? "OpenAI isn't connected for this workspace (Settings → Integrations)." : !canEdit ? "This post can't be regenerated in its current state." : "You can view this post but not generate content."}
      />

      <PostEditor
        key={p.updatedAt.toISOString()}
        postId={id}
        contentType={p.contentType}
        idea={p.idea}
        creative={p.creative}
        variants={p.variants.map((v) => ({ platform: v.platform, title: v.title, content: v.content, caption: v.caption, cta: v.cta, hashtags: v.hashtags, keywords: v.keywords, published: v.publish.state === "published" }))}
        media={media.map(toMediaCard)}
        thumbnail={thumb ? toMediaCard(thumb) : null}
        brand={brand.companyName}
        link={p.link}
        brief={{ topic: p.topic, objective: p.objective, serviceProduct: p.serviceProduct, audience: p.audience, tone: p.tone, language: p.language, contentType: p.contentType, platforms: p.platforms, link: p.link ?? "", notes: p.notes, offerId: p.offerId ?? "", clientId: p.clientId ?? "" }}
        canEdit={canEdit}
        canGenerate={can(viewer, "GENERATE_AI_CONTENT") && (await isOpenAIConfigured())}
        canUpload={can(viewer, "MANAGE_MEDIA")}
      />

      <SectionCard title="Publishing" description="Publish through a connected account, or post it yourself in the platform's app and mark it published. Nothing is published without one of these actions or an approved schedule.">
        {can(viewer, "MANAGE_POSTS") && <div className="mb-4 border-b border-border/50 pb-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Publishing progress</p>
          <PublishTracker postId={id} platforms={p.platforms} canPublish={canPublish} canCancel={canSchedule} compact />
        </div>}
        <PublishPanel
          postId={id}
          locked={archived}
          canPublish={canPublish}
          canMetrics={can(viewer, "VIEW_ANALYTICS")}
          rows={p.variants.map((v) => ({
            platform: v.platform,
            state: v.publish.state,
            method: v.publish.method,
            url: v.publish.url,
            error: v.publish.error,
            at: v.publish.at ? v.publish.at.toISOString() : null,
            connected: connected.has(v.platform),
            metrics: v.metrics ? Object.fromEntries(Object.entries(v.metrics).filter(([, x]) => typeof x === "number")) as Record<string, number> : null,
          }))}
        />
      </SectionCard>

      <SectionCard title="Version history" description="Every AI generation and saved edit.">
        <VersionHistory targetType="post" targetId={id} versions={versions} canRestore={canEdit} />
      </SectionCard>
    </div>
  );
}
