"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskSheet from "@/components/products/sprintos/tasks/TaskSheet";
import { isTaskDone } from "@/lib/products/sprintos/constants";
import { cn } from "@/lib/utils";
import { setTaskStatusAction } from "@/app/(products)/sprintos/(protected)/projects/[id]/task-actions";
import type { SerializedTask } from "@/lib/products/sprintos/tasks";

export default function SubtaskList({
  projectId,
  parentTaskId,
  subtasks,
  employees,
  labelSuggestions,
  canManage,
  canToggle = canManage,
}: {
  projectId: string;
  parentTaskId: string;
  subtasks: SerializedTask[];
  employees: { _id: string; name: string; employeeCode: string }[];
  labelSuggestions: string[];
  /** Add / edit subtasks (staff only). */
  canManage: boolean;
  /** Tick a subtask done — staff, or any project member in the portal. */
  canToggle?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const doneCount = subtasks.filter((s) => isTaskDone(s.status)).length;

  function toggle(sub: SerializedTask) {
    if (!canToggle) return;
    const next = isTaskDone(sub.status) ? "todo" : "done";
    startTransition(async () => {
      const result = await setTaskStatusAction(projectId, sub._id, next);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update subtask.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {subtasks.length > 0 && (
        <p className="text-xs text-muted-foreground">{doneCount}/{subtasks.length} done</p>
      )}
      {subtasks.map((s) => (
        <div key={s._id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-sm">
          <button
            type="button"
            onClick={() => toggle(s)}
            disabled={!canToggle || pending}
            aria-label={isTaskDone(s.status) ? "Mark not done" : "Mark done"}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded border",
              isTaskDone(s.status) ? "border-green-500 bg-green-500 text-white" : "border-border"
            )}
          >
            {isTaskDone(s.status) && <Check className="size-3" />}
          </button>
          <Link
            href={`/sprintos/projects/${projectId}/tasks/${s._id}`}
            className={cn("min-w-0 flex-1 truncate hover:underline", isTaskDone(s.status) && "text-muted-foreground line-through")}
          >
            {s.title}
          </Link>
          <span className="font-mono text-[10px] text-muted-foreground">{s.taskCode}</span>
        </div>
      ))}
      {subtasks.length === 0 && <p className="text-sm text-muted-foreground">No subtasks.</p>}

      {canManage && (
        <TaskSheet
          projectId={projectId}
          parentTaskId={parentTaskId}
          employees={employees}
          labelSuggestions={labelSuggestions}
          trigger={
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
              <Plus className="size-3.5" data-icon="inline-start" />
              Add subtask
            </Button>
          }
        />
      )}
    </div>
  );
}
