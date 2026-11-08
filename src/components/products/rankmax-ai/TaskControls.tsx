"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setTaskStatusAction, addTaskCommentAction } from "@/app/(products)/rankmax-ai/(protected)/actions";

const NEXT: Record<string, { status: string; label: string }[]> = {
  todo: [{ status: "in_progress", label: "Start" }, { status: "cancelled", label: "Cancel" }],
  in_progress: [{ status: "in_review", label: "Send for review" }, { status: "done", label: "Mark done" }, { status: "todo", label: "Back to To Do" }],
  in_review: [{ status: "done", label: "Approve & close" }, { status: "in_progress", label: "Needs changes" }],
  done: [{ status: "in_progress", label: "Reopen" }],
  cancelled: [{ status: "todo", label: "Reopen" }],
};

export function TaskStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {(NEXT[status] ?? []).map((n, i) => (
        <Button
          key={n.status}
          type="button"
          size="sm"
          variant={i === 0 ? "default" : "outline"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await setTaskStatusAction(id, n.status);
              if (!res.ok) toast.error(res.error);
              else {
                toast.success("Status updated");
                router.refresh();
              }
            })
          }
        >
          {pending && i === 0 ? <Loader2 className="size-3.5 animate-spin" /> : n.label}
        </Button>
      ))}
    </div>
  );
}

export function TaskComment({ id }: { id: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        startTransition(async () => {
          const res = await addTaskCommentAction(id, text);
          if (!res.ok) toast.error(res.error);
          else {
            setText("");
            router.refresh();
          }
        });
      }}
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Add an update…" maxLength={2000} aria-label="Comment" />
      <Button type="submit" size="sm" disabled={pending || !text.trim()}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : "Comment"}</Button>
    </form>
  );
}
