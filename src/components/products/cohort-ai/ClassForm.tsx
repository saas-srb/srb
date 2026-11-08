"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CLASS_STATUSES } from "@/lib/products/cohort-ai/constants";
import { saveClassAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/classes/actions";
import type { SerializedClassSchedule } from "@/lib/products/cohort-ai/classes";

type FormState = Record<string, string>;

function fromClass(
  c: SerializedClassSchedule | undefined,
  defaults: { batchId: string; date: string; durationMinutes: number }
): FormState {
  if (!c) {
    return {
      batchId: defaults.batchId,
      date: defaults.date,
      startTime: "19:00",
      durationMinutes: String(defaults.durationMinutes),
      status: "scheduled",
      mentorId: "",
    };
  }
  return {
    batchId: c.batchId,
    topic: c.topic,
    date: c.date,
    startTime: c.startTime ?? "",
    durationMinutes: String(c.durationMinutes),
    mentorId: c.mentorId ?? "",
    meetingLink: c.meetingLink ?? "",
    recordingUrl: c.recordingUrl ?? "",
    notes: c.notes ?? "",
    status: c.status,
  };
}

export default function ClassForm({
  classItem,
  batches,
  mentors,
  defaultBatchId = "",
  defaultDate = "",
  defaultDuration = 90,
  lockBatch = false,
  trigger,
}: {
  classItem?: SerializedClassSchedule;
  batches: { _id: string; name: string; programName?: string }[];
  mentors: { _id: string; name: string }[];
  defaultBatchId?: string;
  defaultDate?: string;
  defaultDuration?: number;
  lockBatch?: boolean;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<FormState>(() =>
    fromClass(classItem, { batchId: defaultBatchId, date: defaultDate || today, durationMinutes: defaultDuration })
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromClass(classItem, { batchId: defaultBatchId, date: defaultDate || today, durationMinutes: defaultDuration }));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveClassAction(form, classItem?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(classItem ? "Class updated" : "Class scheduled");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{classItem ? "Edit Class" : "Schedule Class"}</SheetTitle>
          <SheetDescription>Batch, mentor, timing, meeting link and topic.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Batch *</Label>
            <Select value={form.batchId || ""} onValueChange={(v) => set("batchId", v ?? "")} disabled={lockBatch}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a batch" /></SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b._id} value={b._id}>
                    {b.name}{b.programName ? ` · ${b.programName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err("batchId")}
          </div>

          <div className="space-y-1.5">
            <Label>Topic *</Label>
            <Input value={form.topic ?? ""} onChange={(e) => set("topic", e.target.value)} placeholder="e.g. React hooks deep-dive" />
            {err("topic")}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} />
              {err("date")}
            </div>
            <div className="space-y-1.5">
              <Label>Start time</Label>
              <Input type="time" value={form.startTime ?? ""} onChange={(e) => set("startTime", e.target.value)} />
              {err("startTime")}
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input type="number" min={15} value={form.durationMinutes ?? ""} onChange={(e) => set("durationMinutes", e.target.value)} />
              {err("durationMinutes")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mentor</Label>
              <Select value={form.mentorId || "none"} onValueChange={(v) => set("mentorId", v === "none" ? "" : v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {mentors.map((m) => (
                    <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || "scheduled"} onValueChange={(v) => set("status", v ?? "scheduled")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASS_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Meeting link</Label>
            <Input value={form.meetingLink ?? ""} onChange={(e) => set("meetingLink", e.target.value)} placeholder="https://meet.google.com/…" />
            {err("meetingLink")}
          </div>
          <div className="space-y-1.5">
            <Label>Recording URL</Label>
            <Input value={form.recordingUrl ?? ""} onChange={(e) => set("recordingUrl", e.target.value)} placeholder="Added after the class" />
            {err("recordingUrl")}
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : classItem ? "Save changes" : "Schedule class"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
