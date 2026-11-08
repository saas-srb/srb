import type { FieldDef } from "@/components/products/playbook-ai/EditDialog";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/products/rankmax-ai/tasks";

export function taskFields(users: { value: string; label: string }[], withStatus: boolean): FieldDef[] {
  return [
    { key: "title", label: "Title", type: "text", maxLength: 200 },
    { key: "type", label: "Type", type: "select", options: Object.entries(TASK_TYPES).map(([value, label]) => ({ value, label })) },
    { key: "priority", label: "Priority", type: "select", options: Object.entries(TASK_PRIORITIES).map(([value, label]) => ({ value, label })) },
    ...(withStatus ? [{ key: "status", label: "Status", type: "select" as const, options: Object.entries(TASK_STATUSES).map(([value, label]) => ({ value, label })) }] : []),
    { key: "assigneeId", label: "Assignee", type: "select", noneLabel: "Unassigned", options: users },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "url", label: "Related URL (site path)", type: "text", placeholder: "/services" },
    { key: "description", label: "Description", type: "textarea", rows: 4 },
  ];
}

export const TASK_STATUS_CLASS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/15 text-sky-700",
  in_review: "bg-violet-500/15 text-violet-700",
  done: "bg-emerald-500/15 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground line-through",
};
