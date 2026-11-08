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
import { saveAssignmentAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/assignments/actions";
import type { SerializedAssignment } from "@/lib/products/cohort-ai/assignments";

type FormState = Record<string, string>;

function fromAssignment(a: SerializedAssignment | undefined, defaultBatchId: string): FormState {
  if (!a) return { batchId: defaultBatchId, maxMarks: "100" };
  return {
    title: a.title,
    description: a.description ?? "",
    batchId: a.batchId,
    dueDate: a.dueDate ?? "",
    maxMarks: String(a.maxMarks),
    attachmentUrl: a.attachmentUrl ?? "",
  };
}

export default function AssignmentForm({
  assignment,
  batches,
  defaultBatchId = "",
  trigger,
}: {
  assignment?: SerializedAssignment;
  batches: { _id: string; name: string; programName?: string }[];
  defaultBatchId?: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromAssignment(assignment, defaultBatchId));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveAssignmentAction(form, assignment?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(assignment ? "Assignment updated" : "Assignment created");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(n) => { if (n) { setForm(fromAssignment(assignment, defaultBatchId)); setErrors({}); } setOpen(n); }}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{assignment ? "Edit Assignment" : "New Assignment"}</SheetTitle>
          <SheetDescription>Batch, due date, marks and instructions.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
            {err("title")}
          </div>
          <div className="space-y-1.5">
            <Label>Instructions</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={4} />
          </div>
          <div className="space-y-1.5">
            <Label>Batch *</Label>
            <Select value={form.batchId || ""} onValueChange={(v) => set("batchId", v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a batch" /></SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b._id} value={b._id}>{b.name}{b.programName ? ` · ${b.programName}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err("batchId")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
              {err("dueDate")}
            </div>
            <div className="space-y-1.5">
              <Label>Max marks *</Label>
              <Input type="number" min={1} value={form.maxMarks ?? ""} onChange={(e) => set("maxMarks", e.target.value)} />
              {err("maxMarks")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Attachment URL</Label>
            <Input value={form.attachmentUrl ?? ""} onChange={(e) => set("attachmentUrl", e.target.value)} placeholder="Link to the brief / starter files" />
            {err("attachmentUrl")}
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : assignment ? "Save changes" : "Create assignment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
