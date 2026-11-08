"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import TimesheetLogger from "@/components/products/sprintos/timesheet/TimesheetLogger";
import { TASK_STATUSES, type TaskStatus } from "@/lib/products/sprintos/constants";
import { setTaskStatusAction } from "@/app/(products)/sprintos/(protected)/projects/[id]/task-actions";

export default function EmployeeTaskControls({
  projectId,
  taskId,
  status,
  canUpdateStatus,
  timesheetProjects,
}: {
  projectId: string;
  taskId: string;
  status: TaskStatus;
  canUpdateStatus: boolean;
  timesheetProjects: { _id: string; name: string; tasks: { _id: string; title: string }[] }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<TaskStatus>(status);

  function change(next: string | null) {
    if (!next || next === value) return;
    const prev = value;
    setValue(next as TaskStatus);
    startTransition(async () => {
      const result = await setTaskStatusAction(projectId, taskId, next);
      if (!result.ok) {
        setValue(prev);
        toast.error(result.error ?? "Could not change status.");
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdateStatus && (
        <>
          <Select value={value} onValueChange={change} disabled={pending}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </>
      )}
      <TimesheetLogger
        projects={timesheetProjects}
        defaultProjectId={projectId}
        defaultTaskId={taskId}
        trigger={
          <Button type="button" variant="outline" size="sm">
            <Clock className="size-3.5" data-icon="inline-start" />
            Log Time
          </Button>
        }
      />
    </div>
  );
}
