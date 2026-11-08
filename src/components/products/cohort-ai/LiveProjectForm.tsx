"use client";

import { useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LIVE_PROJECT_STATUSES } from "@/lib/products/cohort-ai/constants";
import { saveLiveProjectAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/projects/actions";
import type { SerializedLiveProject, Milestone } from "@/lib/products/cohort-ai/projects";

export interface StudentMembership {
  studentId: string;
  fullName: string;
  batchId: string;
}

export default function LiveProjectForm({
  project,
  programs,
  batches,
  mentors,
  memberships,
  trigger,
}: {
  project?: SerializedLiveProject;
  programs: { _id: string; name: string }[];
  batches: { _id: string; name: string; programId: string }[];
  mentors: { _id: string; name: string }[];
  memberships: StudentMembership[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [programId, setProgramId] = useState(project?.programId ?? "");
  const [batchId, setBatchId] = useState(project?.batchId ?? "");
  const [mentorId, setMentorId] = useState(project?.mentorId ?? "");
  const [status, setStatus] = useState<string>(project?.status ?? "planned");
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl ?? "");
  const [demoUrl, setDemoUrl] = useState(project?.demoUrl ?? "");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  const [progressPercent, setProgressPercent] = useState(String(project?.progressPercent ?? 0));
  const [studentIds, setStudentIds] = useState<string[]>(project?.studentIds ?? []);
  const [milestones, setMilestones] = useState<Milestone[]>(project?.milestones ?? []);

  const programBatches = useMemo(() => batches.filter((b) => !programId || b.programId === programId), [batches, programId]);
  const batchStudents = useMemo(
    () => memberships.filter((m) => !batchId || m.batchId === batchId),
    [memberships, batchId]
  );

  function reset() {
    setTitle(project?.title ?? "");
    setDescription(project?.description ?? "");
    setProgramId(project?.programId ?? "");
    setBatchId(project?.batchId ?? "");
    setMentorId(project?.mentorId ?? "");
    setStatus(project?.status ?? "planned");
    setRepoUrl(project?.repoUrl ?? "");
    setDemoUrl(project?.demoUrl ?? "");
    setStartDate(project?.startDate ?? "");
    setDueDate(project?.dueDate ?? "");
    setProgressPercent(String(project?.progressPercent ?? 0));
    setStudentIds(project?.studentIds ?? []);
    setMilestones(project?.milestones ?? []);
    setErrors({});
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveLiveProjectAction(
        {
          title,
          description,
          programId,
          batchId,
          mentorId,
          status,
          repoUrl,
          demoUrl,
          startDate,
          dueDate,
          progressPercent,
          studentIds,
          milestones,
        },
        project?._id
      );
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(project ? "Project updated" : "Project created");
      setOpen(false);
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <Sheet open={open} onOpenChange={(n) => { if (n) reset(); setOpen(n); }}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{project ? "Edit Project" : "New Live Project"}</SheetTitle>
          <SheetDescription>Assign a real-world project to students with milestones.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            {err("title")}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Program *</Label>
              <Select value={programId} onValueChange={(v) => { setProgramId(v ?? ""); setBatchId(""); setStudentIds([]); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {programs.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {err("programId")}
            </div>
            <div className="space-y-1.5">
              <Label>Batch</Label>
              <Select value={batchId || "none"} onValueChange={(v) => { setBatchId(v === "none" ? "" : v ?? ""); setStudentIds([]); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific batch</SelectItem>
                  {programBatches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mentor</Label>
              <Select value={mentorId || "none"} onValueChange={(v) => setMentorId(v === "none" ? "" : v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {mentors.map((m) => <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? "planned")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIVE_PROJECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assigned students</Label>
            {batchStudents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Pick a batch with enrolled students to assign.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                {batchStudents.map((s) => (
                  <label key={s.studentId} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={studentIds.includes(s.studentId)}
                      onCheckedChange={(v) =>
                        setStudentIds((ids) => (v === true ? [...ids, s.studentId] : ids.filter((i) => i !== s.studentId)))
                      }
                    />
                    {s.fullName}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              {err("dueDate")}
            </div>
            <div className="space-y-1.5">
              <Label>Progress %</Label>
              <Input type="number" min={0} max={100} value={progressPercent} onChange={(e) => setProgressPercent(e.target.value)} disabled={milestones.length > 0} />
            </div>
          </div>
          {milestones.length > 0 && <p className="-mt-2 text-xs text-muted-foreground">Progress is derived from milestones.</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Repo URL</Label>
              <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
              {err("repoUrl")}
            </div>
            <div className="space-y-1.5">
              <Label>Demo URL</Label>
              <Input value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} />
              {err("demoUrl")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Milestones</Label>
            <div className="space-y-1.5">
              {milestones.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Checkbox checked={m.done} onCheckedChange={(v) => setMilestones((ms) => ms.map((x, xi) => (xi === i ? { ...x, done: v === true } : x)))} />
                  <Input
                    value={m.title}
                    onChange={(e) => setMilestones((ms) => ms.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))}
                    className="h-8"
                  />
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => setMilestones((ms) => ms.filter((_, xi) => xi !== i))}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMilestones((ms) => [...ms, { id: `new-${ms.length}-${Date.now()}`, title: "", done: false, dueDate: null }])}
              >
                <Plus className="size-3.5" data-icon="inline-start" />
                Add milestone
              </Button>
            </div>
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : project ? "Save changes" : "Create project"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
