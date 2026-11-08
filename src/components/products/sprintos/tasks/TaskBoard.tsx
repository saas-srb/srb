"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import TaskCard from "@/components/products/sprintos/tasks/TaskCard";
import TaskSheet from "@/components/products/sprintos/tasks/TaskSheet";
import { TASK_STATUSES, type TaskStatus } from "@/lib/products/sprintos/constants";
import { cn } from "@/lib/utils";
import { moveTaskAction } from "@/app/(products)/sprintos/(protected)/projects/[id]/task-actions";
import type { SerializedTask } from "@/lib/products/sprintos/tasks";

type Columns = Record<TaskStatus, SerializedTask[]>;

interface Props {
  projectId: string;
  board: Columns;
  employees: { _id: string; name: string; employeeCode: string }[];
  labelSuggestions: string[];
  canManage: boolean;
}

function SortableTask({
  task,
  projectId,
  assigneeName,
  overdue,
  disabled,
}: {
  task: SerializedTask;
  projectId: string;
  assigneeName: string | null;
  overdue: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task._id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <TaskCard
        task={task}
        projectId={projectId}
        assigneeName={assigneeName}
        overdue={overdue}
        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  );
}

export default function TaskBoard({ projectId, board, employees, labelSuggestions, canManage }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState<Columns>(board);
  const [activeId, setActiveId] = useState<string | null>(null);

  const empName = useMemo(() => new Map(employees.map((e) => [e._id, e.name])), [employees]);
  const today = new Date().toISOString().slice(0, 10);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const allTasks = useMemo(() => Object.values(columns).flat(), [columns]);
  const activeTask = activeId ? allTasks.find((t) => t._id === activeId) ?? null : null;

  function columnOf(taskId: string): TaskStatus | null {
    for (const s of TASK_STATUSES) if (columns[s.value].some((t) => t._id === taskId)) return s.value;
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const from = columnOf(activeIdStr);
    if (!from) return;

    // `over` is either a task id or a column droppable id (`col:<status>`).
    const to: TaskStatus | null = overIdStr.startsWith("col:")
      ? (overIdStr.slice(4) as TaskStatus)
      : columnOf(overIdStr);
    if (!to) return;

    const snapshot = columns;
    const next: Columns = { ...columns, [from]: [...columns[from]], [to]: [...columns[to]] };
    const moving = next[from].find((t) => t._id === activeIdStr);
    if (!moving) return;
    next[from] = next[from].filter((t) => t._id !== activeIdStr);

    let insertAt = next[to].length;
    if (!overIdStr.startsWith("col:")) {
      const idx = next[to].findIndex((t) => t._id === overIdStr);
      if (idx >= 0) insertAt = idx;
    }
    next[to] = [...next[to].slice(0, insertAt), { ...moving, status: to }, ...next[to].slice(insertAt)];

    if (from === to && snapshot[from].findIndex((t) => t._id === activeIdStr) === insertAt) return;

    setColumns(next);

    const beforeKey = insertAt > 0 ? next[to][insertAt - 1].orderKey : null;
    const afterKey = insertAt + 1 < next[to].length ? next[to][insertAt + 1].orderKey : null;

    const result = await moveTaskAction(projectId, activeIdStr, to, beforeKey, afterKey);
    if (!result.ok) {
      setColumns(snapshot);
      toast.error(result.error ?? "Could not move task.");
      return;
    }
    router.refresh();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUSES.map((s) => (
          <Column
            key={s.value}
            status={s.value}
            label={s.label}
            dotClass={s.dotClass}
            tasks={columns[s.value]}
            projectId={projectId}
            empName={empName}
            today={today}
            canManage={canManage}
            employees={employees}
            labelSuggestions={labelSuggestions}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            projectId={projectId}
            assigneeName={activeTask.assigneeId ? empName.get(activeTask.assigneeId) ?? null : null}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  label,
  dotClass,
  tasks,
  projectId,
  empName,
  today,
  canManage,
  employees,
  labelSuggestions,
}: {
  status: TaskStatus;
  label: string;
  dotClass: string;
  tasks: SerializedTask[];
  projectId: string;
  empName: Map<string, string>;
  today: string;
  canManage: boolean;
  employees: { _id: string; name: string; employeeCode: string }[];
  labelSuggestions: string[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-2xl border border-border/50 bg-muted/30 p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className={`size-2 rounded-full ${dotClass}`} />
          {label}
          <span className="text-xs font-normal text-muted-foreground">{tasks.length}</span>
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-xl p-1 transition-colors",
          isOver && "bg-primary/5"
        )}
      >
        <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableTask
              key={t._id}
              task={t}
              projectId={projectId}
              assigneeName={t.assigneeId ? empName.get(t.assigneeId) ?? null : null}
              overdue={Boolean(t.dueDate && t.dueDate < today && t.status !== "done")}
              disabled={!canManage}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Drop tasks here</p>}
      </div>
      {canManage && (
        <TaskSheet
          projectId={projectId}
          defaultStatus={status}
          employees={employees}
          labelSuggestions={labelSuggestions}
          trigger={
            <Button type="button" variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground">
              <Plus className="size-3.5" data-icon="inline-start" />
              Add task
            </Button>
          }
        />
      )}
    </div>
  );
}
