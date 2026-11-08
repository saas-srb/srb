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
import { BATCH_STATUSES, TRAINING_MODES } from "@/lib/products/cohort-ai/constants";
import { saveBatchAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/batches/actions";
import type { SerializedBatch } from "@/lib/products/cohort-ai/batches";

type FormState = Record<string, string>;

function fromBatch(b: SerializedBatch | undefined, defaultProgramId: string): FormState {
  if (!b) {
    return { programId: defaultProgramId, mode: "online", status: "upcoming", capacity: "30", mentorId: "" };
  }
  return {
    programId: b.programId,
    name: b.name,
    startDate: b.startDate ?? "",
    endDate: b.endDate ?? "",
    timing: b.timing ?? "",
    mentorId: b.mentorId ?? "",
    capacity: String(b.capacity),
    mode: b.mode,
    status: b.status,
    notes: b.notes ?? "",
  };
}

export default function BatchForm({
  batch,
  programs,
  mentors,
  defaultProgramId = "",
  lockProgram = false,
  trigger,
  onSaved,
}: {
  batch?: SerializedBatch;
  programs: { _id: string; name: string }[];
  mentors: { _id: string; name: string }[];
  defaultProgramId?: string;
  lockProgram?: boolean;
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromBatch(batch, defaultProgramId));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromBatch(batch, defaultProgramId));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveBatchAction(form, batch?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(batch ? "Batch updated" : "Batch created");
      setOpen(false);
      if (result.id && onSaved) onSaved(result.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{batch ? "Edit Batch" : "New Batch"}</SheetTitle>
          <SheetDescription>Schedule, mentor, capacity and delivery mode.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Program *</Label>
            <Select value={form.programId || ""} onValueChange={(v) => set("programId", v ?? "")} disabled={lockProgram}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a program" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err("programId")}
          </div>

          <div className="space-y-1.5">
            <Label>Batch name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. MERN — Jan 2026 Evening" />
            {err("name")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
              {err("startDate")}
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
              {err("endDate")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Timing</Label>
            <Input value={form.timing ?? ""} onChange={(e) => set("timing", e.target.value)} placeholder="e.g. Mon–Fri · 7:00–9:00 PM IST" />
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
              <Label>Capacity *</Label>
              <Input type="number" min={1} value={form.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} />
              {err("capacity")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={form.mode || "online"} onValueChange={(v) => set("mode", v ?? "online")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRAINING_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || "upcoming"} onValueChange={(v) => set("status", v ?? "upcoming")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BATCH_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : batch ? "Save changes" : "Create batch"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
