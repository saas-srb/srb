"use client";

import { useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { parseHHmm } from "@/lib/products/sprintos/constants";
import { saveTimesheetAction } from "@/app/(products)/sprintos/(protected)/me/timesheet/actions";
import type { SerializedTimesheetEntry } from "@/lib/products/sprintos/timesheets";

const NONE = "__none__";

interface ProjectOption {
  _id: string;
  name: string;
  tasks: { _id: string; title: string }[];
}

type FormState = Record<string, string>;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fromEntry(e: SerializedTimesheetEntry | undefined, defaults: { projectId?: string; taskId?: string }): FormState {
  if (!e)
    return {
      projectId: defaults.projectId ?? "",
      taskId: defaults.taskId ?? "",
      date: todayStr(),
      billable: "true",
    };
  return {
    projectId: e.projectId,
    taskId: e.taskId ?? "",
    date: e.date,
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
    hours: String(e.hours),
    description: e.description ?? "",
    billable: e.billable ? "true" : "false",
  };
}

export default function TimesheetLogger({
  projects,
  entry,
  defaultProjectId,
  defaultTaskId,
  trigger,
  onSaved,
}: {
  projects: ProjectOption[];
  entry?: SerializedTimesheetEntry;
  defaultProjectId?: string;
  defaultTaskId?: string;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromEntry(entry, { projectId: defaultProjectId, taskId: defaultTaskId }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  const tasks = useMemo(() => projects.find((p) => p._id === form.projectId)?.tasks ?? [], [projects, form.projectId]);

  const computedHours = useMemo(() => {
    const s = parseHHmm(form.startTime || null);
    const e = parseHHmm(form.endTime || null);
    if (s !== null && e !== null && e > s) return Math.round(((e - s) / 60) * 100) / 100;
    return null;
  }, [form.startTime, form.endTime]);

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromEntry(entry, { projectId: defaultProjectId, taskId: defaultTaskId }));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const payload = { ...form, billable: form.billable === "true" };
      const result = await saveTimesheetAction(payload, entry?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(entry ? "Entry updated" : "Hours logged");
      setOpen(false);
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{entry ? "Edit Time Entry" : "Log Hours"}</SheetTitle>
          <SheetDescription>Enter a start &amp; end time, or the total hours directly.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={form.projectId || NONE} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === NONE ? "" : (v ?? ""), taskId: "" }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select a project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err("projectId")}
          </div>
          <div className="space-y-1.5">
            <Label>Task</Label>
            <Select value={form.taskId || NONE} onValueChange={(v) => set("taskId", v === NONE ? "" : (v ?? ""))} disabled={!form.projectId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="No specific task" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No specific task</SelectItem>
                {tasks.map((t) => (
                  <SelectItem key={t._id} value={t._id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={form.date ?? ""} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
            {err("date")}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={form.startTime ?? ""} onChange={(e) => set("startTime", e.target.value)} />
              {err("startTime")}
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="time" value={form.endTime ?? ""} onChange={(e) => set("endTime", e.target.value)} />
              {err("endTime")}
            </div>
            <div className="space-y-1.5">
              <Label>Hours</Label>
              <Input
                type="number"
                step="0.25"
                min={0}
                value={computedHours != null ? String(computedHours) : (form.hours ?? "")}
                onChange={(e) => set("hours", e.target.value)}
                disabled={computedHours != null}
              />
              {err("hours")}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.billable === "true"} onCheckedChange={(c) => set("billable", c ? "true" : "false")} />
            Billable
          </label>
          <div className="space-y-1.5">
            <Label>Work description</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>
          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : entry ? "Save changes" : "Log hours"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
