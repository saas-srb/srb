"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { addTaskCommentAction, deleteTaskCommentAction } from "@/app/(products)/sprintos/(protected)/projects/[id]/task-actions";
import type { SerializedTaskComment } from "@/lib/products/sprintos/task-comments";

export default function TaskComments({
  projectId,
  taskId,
  comments,
  currentUserId,
  isAdmin,
}: {
  projectId: string;
  taskId: string;
  comments: SerializedTaskComment[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addTaskCommentAction(projectId, taskId, text);
      if (!result.ok) {
        toast.error(result.error ?? "Could not post comment.");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteTaskCommentAction(projectId, taskId, id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete comment.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {comments.map((c) => (
        <div key={c._id} className="rounded-lg border border-border/60 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{c.authorEmail ?? "Unknown"}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {formatDateTime(c.createdAt)}
              {c.editedAt && " · edited"}
              {(isAdmin || c.authorId === currentUserId) && (
                <button type="button" onClick={() => remove(c._id)} aria-label="Delete comment" className="hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.body}</p>
        </div>
      ))}

      <div className="space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Add a comment…" />
        <Button type="button" size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Comment"}
        </Button>
      </div>
    </div>
  );
}
