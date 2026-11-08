"use client";

import Link from "next/link";
import { CalendarClock, GripVertical } from "lucide-react";
import { PriorityBadge } from "@/components/products/sprintos/StatusBadges";
import { cn, formatDate } from "@/lib/utils";
import type { SerializedTask } from "@/lib/products/sprintos/tasks";

export default function TaskCard({
  task,
  projectId,
  assigneeName,
  dragHandleProps,
  overdue,
  dragging = false,
}: {
  task: SerializedTask;
  projectId: string;
  assigneeName: string | null;
  dragHandleProps?: Record<string, unknown>;
  overdue?: boolean;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-background/95 p-2.5 text-sm shadow-none transition-shadow dark:bg-card/80",
        dragging && "shadow-lg ring-1 ring-primary/30"
      )}
    >
      <div className="flex items-start gap-1.5">
        {dragHandleProps && (
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            aria-label="Drag task"
            {...dragHandleProps}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/sprintos/projects/${projectId}/tasks/${task._id}`}
            className="line-clamp-2 font-medium text-foreground hover:underline"
          >
            {task.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">{task.taskCode}</span>
            <PriorityBadge priority={task.priority} />
          </div>
          {task.labels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {task.labels.map((l) => (
                <span key={l} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{l}</span>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">{assigneeName ?? "Unassigned"}</span>
            {task.dueDate && (
              <span className={cn("flex shrink-0 items-center gap-1", overdue && "font-medium text-destructive")}>
                <CalendarClock className="size-3" />
                {formatDate(task.dueDate)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
