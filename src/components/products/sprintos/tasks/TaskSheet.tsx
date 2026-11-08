"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { TASK_STATUSES, PRIORITIES } from "@/lib/products/sprintos/constants";
import { saveTaskAction } from "@/app/(products)/sprintos/(protected)/projects/[id]/task-actions";
import type { SerializedTask } from "@/lib/products/sprintos/tasks";

const NONE = "__none__";

type FormState = Record<string, string>;

function fromTask(t: SerializedTask | undefined, parentTaskId: string | undefined, defaultStatus: string): FormState {
  if (!t) return { status: defaultStatus, priority: "medium", parentTaskId: parentTaskId ?? "" };
  return {
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId ?? "",
    startDate: t.startDate ?? "",
    dueDate: t.dueDate ?? "",
    estimateHours: t.estimateHours != null ? String(t.estimateHours) : "",
    parentTaskId: t.parentTaskId ?? "",
  };
}

export default function TaskSheet({
  projectId,
  task,
  parentTaskId,
  defaultStatus = "todo",
  employees,
  labelSuggestions,
  trigger,
  onSaved,
}: {
  projectId: string;
  task?: SerializedTask;
  parentTaskId?: string;
  defaultStatus?: string;
  employees: { _id: string; name: string; employeeCode: string }[];
  labelSuggestions: string[];
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromTask(task, parentTaskId, defaultStatus));
  const [labels, setLabels] = useState<string[]>(task?.labels ?? []);
  const [labelInput, setLabelInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromTask(task, parentTaskId, defaultStatus));
      setLabels(task?.labels ?? []);
      setErrors({});
    }
    setOpen(next);
  }

  function addLabel(value: string) {
    const v = value.trim();
    if (v && !labels.includes(v)) setLabels((l) => [...l, v]);
    setLabelInput("");
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveTaskAction(projectId, { ...form, labels }, task?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(task ? "Task updated" : "Task created");
      setOpen(false);
      onSaved?.();
      router.refresh();
    });
  }

  const labelPool = labelSuggestions.filter((s) => !labels.includes(s)).slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{task ? "Edit Task" : parentTaskId ? "New Subtask" : "New Task"}</SheetTitle>
          <SheetDescription>{task ? task.taskCode : "A task code is generated on save."}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
            {err("title")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || "todo"} onValueChange={(v) => set("status", v ?? "todo")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority || "medium"} onValueChange={(v) => set("priority", v ?? "medium")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select value={form.assigneeId || NONE} onValueChange={(v) => set("assigneeId", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e._id} value={e._id}>{e.name} · {e.employeeCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
              {err("startDate")}
            </div>
            <div className="space-y-1.5">
              <Label>Due</Label>
              <Input type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
              {err("dueDate")}
            </div>
            <div className="space-y-1.5">
              <Label>Est. hrs</Label>
              <Input type="number" min={0} value={form.estimateHours ?? ""} onChange={(e) => set("estimateHours", e.target.value)} />
              {err("estimateHours")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <span key={l} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {l}
                  <button type="button" onClick={() => setLabels((prev) => prev.filter((x) => x !== l))} aria-label={`Remove ${l}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addLabel(labelInput);
                }
              }}
              placeholder="Type a label and press Enter"
            />
            {labelPool.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {labelPool.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addLabel(s)}
                    className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={4} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
