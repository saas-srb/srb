"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Flag } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { MILESTONE_STATUSES, getMilestoneStatusMeta } from "@/lib/products/sprintos/constants";
import { cn, formatDate } from "@/lib/utils";
import { saveMilestoneAction, deleteMilestoneAction } from "@/app/(products)/sprintos/(protected)/projects/[id]/milestone-actions";
import type { MilestoneWithProgress } from "@/lib/products/sprintos/milestones";

interface TaskOption {
  _id: string;
  title: string;
  taskCode: string;
}

export default function MilestonesManager({
  projectId,
  milestones,
  tasks,
  canManage,
}: {
  projectId: string;
  milestones: MilestoneWithProgress[];
  tasks: TaskOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MilestoneWithProgress | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [linked, setLinked] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function openCreate() {
    setEditing(null);
    setForm({ status: "pending", manualProgressPercent: "0" });
    setLinked([]);
    setErrors({});
    setSheetOpen(true);
  }
  function openEdit(m: MilestoneWithProgress) {
    setEditing(m);
    setForm({
      name: m.name,
      description: m.description ?? "",
      dueDate: m.dueDate ?? "",
      status: m.status,
      manualProgressPercent: String(m.manualProgressPercent),
    });
    setLinked(m.linkedTaskIds);
    setErrors({});
    setSheetOpen(true);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveMilestoneAction(projectId, { ...form, linkedTaskIds: linked }, editing?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(editing ? "Milestone updated" : "Milestone created");
      setSheetOpen(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteMilestoneAction(projectId, id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete milestone.");
        return;
      }
      toast.success("Milestone deleted");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><Flag className="size-4" /> Milestones ({milestones.length})</CardTitle>
        {canManage && (
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-3.5" data-icon="inline-start" />
            New Milestone
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones yet.</p>}
        {milestones.map((m) => {
          const meta = getMilestoneStatusMeta(m.status);
          return (
            <div key={m._id} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{m.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5", meta.badgeClass)}>
                      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
                      {meta.label}
                    </span>
                    {m.dueDate && (
                      <span className={cn(m.overdue && "font-medium text-destructive")}>Due {formatDate(m.dueDate)}</span>
                    )}
                    {m.linkedTaskCount > 0 && <span>{m.linkedTaskDone}/{m.linkedTaskCount} tasks done</span>}
                  </p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${m.name}`} disabled={pending}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {m.name}?</AlertDialogTitle>
                          <AlertDialogDescription>The milestone is removed. Linked tasks are not affected.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(m._id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
              {m.description && <p className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground">{m.description}</p>}
              <ProgressBar value={m.progressPercent} className="mt-2" />
            </div>
          );
        })}
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{editing ? "Edit Milestone" : "New Milestone"}</SheetTitle>
            <SheetDescription>Link tasks to derive progress automatically, or set it manually.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              {err("name")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || "pending"} onValueChange={(v) => set("status", v ?? "pending")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MILESTONE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
                {err("dueDate")}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Manual progress ({form.manualProgressPercent || 0}%)</Label>
              <Input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.manualProgressPercent || "0"}
                onChange={(e) => set("manualProgressPercent", e.target.value)}
                disabled={linked.length > 0}
              />
              {linked.length > 0 && <p className="text-xs text-muted-foreground">Progress is derived from {linked.length} linked task(s).</p>}
              {err("manualProgressPercent")}
            </div>
            <div className="space-y-1.5">
              <Label>Linked tasks</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                {tasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks in this project yet.</p>}
                {tasks.map((t) => (
                  <label key={t._id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={linked.includes(t._id)}
                      onChange={(e) =>
                        setLinked((prev) => (e.target.checked ? [...prev, t._id] : prev.filter((x) => x !== t._id)))
                      }
                    />
                    <span className="min-w-0 truncate">{t.title}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{t.taskCode}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </GlassCard>
  );
}
