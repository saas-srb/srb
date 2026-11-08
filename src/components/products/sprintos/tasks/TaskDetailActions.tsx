"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import TaskSheet from "@/components/products/sprintos/tasks/TaskSheet";
import { TASK_STATUSES, type TaskStatus } from "@/lib/products/sprintos/constants";
import { setTaskStatusAction, deleteTaskAction } from "@/app/(products)/sprintos/(protected)/projects/[id]/task-actions";
import type { SerializedTask } from "@/lib/products/sprintos/tasks";

export default function TaskDetailActions({
  task,
  employees,
  labelSuggestions,
  redirectOnDelete,
}: {
  task: SerializedTask;
  employees: { _id: string; name: string; employeeCode: string }[];
  labelSuggestions: string[];
  redirectOnDelete: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<TaskStatus>(task.status);

  function change(next: string | null) {
    if (!next || next === status) return;
    const prev = status;
    setStatus(next as TaskStatus);
    startTransition(async () => {
      const result = await setTaskStatusAction(task.projectId, task._id, next);
      if (!result.ok) {
        setStatus(prev);
        toast.error(result.error ?? "Could not change status.");
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTaskAction(task.projectId, task._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete task.");
        return;
      }
      toast.success("Task deleted");
      router.push(redirectOnDelete);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status} onValueChange={change} disabled={pending}>
        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      <TaskSheet
        projectId={task.projectId}
        task={task}
        employees={employees}
        labelSuggestions={labelSuggestions}
        trigger={
          <Button type="button" variant="outline" size="sm">
            <Pencil className="size-3.5" data-icon="inline-start" />
            Edit
          </Button>
        }
      />
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              <Trash2 className="size-3.5" data-icon="inline-start" />
              Delete
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {task.taskCode}?</AlertDialogTitle>
            <AlertDialogDescription>The task and any subtasks are soft-deleted and kept for audit history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
