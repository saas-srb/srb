"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Pencil, Trash2, Archive, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  publishAnnouncementAction,
  deleteAnnouncementAction,
  archiveAnnouncementAction,
} from "@/app/(products)/huddle-ai/(protected)/announcements/actions";

export default function AnnouncementActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "published" && status !== "archived" && (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await publishAnnouncementAction(id);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Send className="size-3.5" data-icon="inline-start" />}
          Publish now
        </Button>
      )}
      {status !== "published" && (
        <Button render={<Link href={`/huddle-ai/announcements/${id}/edit`} />} size="sm" variant="outline">
          <Pencil className="size-3.5" data-icon="inline-start" />
          Edit
        </Button>
      )}
      {status === "published" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await archiveAnnouncementAction(id);
              router.refresh();
            })
          }
        >
          <Archive className="size-3.5" data-icon="inline-start" />
          Archive
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this announcement?")) return;
          startTransition(async () => {
            await deleteAnnouncementAction(id);
            router.push("/huddle-ai/announcements");
          });
        }}
      >
        <Trash2 className="size-3.5" data-icon="inline-start" />
        Delete
      </Button>
    </div>
  );
}

export function AcknowledgeButton({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400">
        <Check className="size-4" />
        You&apos;ve confirmed this
      </span>
    );
  }

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { acknowledgeAnnouncementAction } = await import("@/app/(products)/huddle-ai/(protected)/announcements/actions");
          await acknowledgeAnnouncementAction(id);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Check className="size-4" data-icon="inline-start" />}
      Confirm you&apos;ve read this
    </Button>
  );
}
