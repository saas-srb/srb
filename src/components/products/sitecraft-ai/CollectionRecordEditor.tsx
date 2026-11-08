"use client";

import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, CircleDot, CloudCheck, ExternalLink, Loader2, Rocket, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SectionConfigForm from "@/components/products/sitecraft-ai/SectionConfigForm";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";
import {
  saveRecordAction, publishRecordAction, archiveRecordAction, revertRecordAction,
} from "@/app/(products)/sitecraft-ai/(protected)/collections/actions";

/**
 * Edits one collection record with the same generic form the page builder
 * uses for sections. Save = draft (never public); Publish = live on every
 * page that shows this record; Archive = hide it everywhere; Revert = drop
 * unpublished edits (or delete a record that was never published).
 */
export default function CollectionRecordEditor({
  collection,
  slug,
  initial,
  isPublished,
  isArchived,
  hasUnpublishedChanges,
  publicPath,
  canEdit,
  canPublish,
}: {
  collection: string;
  slug: string;
  initial: Record<string, unknown>;
  isPublished: boolean;
  isArchived: boolean;
  hasUnpublishedChanges: boolean;
  publicPath: string | null;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const def = COLLECTIONS[collection as CollectionKey];
  const [value, setValue] = useState<Record<string, unknown>>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  // Record edits aren't saved automatically — warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? "Something went wrong."); return; }
      toast.success(success);
      after?.();
      router.refresh();
    });

  const save = () => run(() => saveRecordAction(collection, slug, value), "Draft saved");
  const publish = () =>
    startTransition(async () => {
      if (dirty) {
        const saved = await saveRecordAction(collection, slug, value);
        if (!saved.ok) { toast.error(saved.error); return; }
      }
      const res = await publishRecordAction(collection, slug);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(
        res.pageCreated
          ? "Published — its page was created from a similar page; review its text and SEO under Pages"
          : "Published — live everywhere this record appears"
      );
      router.refresh();
    });
  const archive = () => run(() => archiveRecordAction(collection, slug, !isArchived), isArchived ? "Back on the site" : "Hidden from the site");
  const revert = async () => {
    const msg = isPublished
      ? "Discard your unpublished changes and go back to the live version?"
      : "Delete this record? It has never been published, so this can't be undone.";
    if (!(await confirm({ title: isPublished ? "Discard unpublished changes?" : "Delete this record?", description: msg, confirmLabel: isPublished ? "Discard changes" : "Delete", destructive: true }))) return;
    run(() => revertRecordAction(collection, slug), isPublished ? "Changes discarded" : "Deleted", () => {
      if (!isPublished) router.push(`/sitecraft-ai/collections/${collection}`);
    });
  };

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-background/90 px-3 py-2 backdrop-blur-md dark:bg-card/85">
        <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          {pending ? (
            <><Loader2 className="size-3.5 animate-spin" /> Working…</>
          ) : dirty ? (
            <><CircleDot className="size-3.5 text-amber-500" /> Unsaved changes</>
          ) : (
            <><CloudCheck className="size-3.5 text-emerald-500" /> {isArchived ? "Archived — hidden from every page and listing" : isPublished ? (hasUnpublishedChanges ? "Saved — draft differs from the live version" : "Live version is up to date") : "Saved as draft — not on the site until published"}</>
          )}
        </span>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={save} disabled={pending || !dirty}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save draft
          </Button>
        )}
        {canPublish && (
          <Button size="sm" onClick={publish} disabled={pending || (!dirty && isPublished && !hasUnpublishedChanges)}>
            <Rocket className="size-3.5" /> Publish
          </Button>
        )}
        {canPublish && (
          <Button variant="outline" size="sm" onClick={archive} disabled={pending}>
            {isArchived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} {isArchived ? "Unarchive" : "Archive"}
          </Button>
        )}
        {canPublish && (!isPublished || hasUnpublishedChanges) && (
          <Button variant="outline" size="sm" onClick={revert} disabled={pending}>
            <RotateCcw className="size-3.5" /> {isPublished ? "Discard changes" : "Delete"}
          </Button>
        )}
        {publicPath && isPublished && !isArchived && (
          <a href={publicPath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1 text-xs font-medium text-primary hover:underline">
            View on site <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <GlassCard interactive={false} className="p-5">
        <SectionConfigForm def={{ fields: def.fields }} value={value} onChange={setValue} />
      </GlassCard>
    </div>
  );
}
