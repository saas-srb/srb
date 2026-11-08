"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, CalendarClock, Ban, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cancelAssignmentAction, grantAttemptAction, updateAssignmentAction } from "@/app/(products)/evaliq/(protected)/actions";
import { PRIORITIES } from "@/lib/products/evaliq/constants";
import { toLocalInput } from "@/components/products/evaliq/TestConfigForm";

export interface AssignmentEditValues {
  id: string;
  label: string;
  status: string;
  startAt: string | null;
  dueAt: string | null;
  maxAttempts: number | null;
  priority: string;
  instructions: string;
  allowLateStart: boolean;
}

export default function AssignmentRowActions({ a, canEdit, canCancel }: { a: AssignmentEditValues; canEdit: boolean; canCancel: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "cancel" | null>(null);
  const [v, setV] = useState(() => ({ startAt: toLocalInput(a.startAt), dueAt: toLocalInput(a.dueAt), maxAttempts: a.maxAttempts ? String(a.maxAttempts) : "", priority: a.priority, instructions: a.instructions, allowLateStart: a.allowLateStart }));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const cancellable = a.status === "assigned" || a.status === "expired";
  const finished = a.status === "completed" || a.status === "evaluated";

  function done(res: { ok: boolean; error?: string }, msg: string) {
    if (!res.ok) toast.error(res.error ?? "Could not complete that.");
    else {
      toast.success(msg);
      setMode(null);
      router.refresh();
    }
  }

  if (!canEdit && !(canCancel && cancellable)) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${a.label}`} />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && a.status !== "cancelled" && (
            <DropdownMenuItem onClick={() => setMode("edit")}>
              <CalendarClock className="size-3.5" /> Edit dates & rules
            </DropdownMenuItem>
          )}
          {canEdit && (finished || a.status === "expired") && (
            <DropdownMenuItem onClick={() => start(async () => done(await grantAttemptAction(a.id), "One extra attempt granted"))}>
              <PlusCircle className="size-3.5" /> Grant an extra attempt
            </DropdownMenuItem>
          )}
          {canCancel && cancellable && (
            <DropdownMenuItem variant="destructive" onClick={() => setMode("cancel")}>
              <Ban className="size-3.5" /> Cancel assignment
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Edit assignment · ${a.label}`}</DialogTitle>
            <DialogDescription>Extending the due date re-opens an expired assignment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`s-${a.id}`}>Start</Label>
              <Input id={`s-${a.id}`} type="datetime-local" value={v.startAt} onChange={(e) => setV((x) => ({ ...x, startAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`d-${a.id}`}>Due</Label>
              <Input id={`d-${a.id}`} type="datetime-local" value={v.dueAt} onChange={(e) => setV((x) => ({ ...x, dueAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`m-${a.id}`}>Attempt limit</Label>
              <Input id={`m-${a.id}`} type="number" min={1} value={v.maxAttempts} onChange={(e) => setV((x) => ({ ...x, maxAttempts: e.target.value }))} placeholder="Test default" />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <OptionSelect value={v.priority} onChange={(x) => setV((y) => ({ ...y, priority: x }))} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} aria-label="Priority" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`i-${a.id}`}>Instructions</Label>
              <Textarea id={`i-${a.id}`} value={v.instructions} onChange={(e) => setV((x) => ({ ...x, instructions: e.target.value }))} rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={v.allowLateStart} onChange={(e) => setV((x) => ({ ...x, allowLateStart: e.target.checked }))} /> Allow starting after the due date
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={pending}
              onClick={() => start(async () => done(await updateAssignmentAction(a.id, { ...v, startAt: v.startAt ? new Date(v.startAt).toISOString() : "", dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : "" }), "Assignment updated"))}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "cancel"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Cancel assignment · ${a.label}`}</DialogTitle>
            <DialogDescription>The candidate will no longer see this test. This is recorded in the activity log.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (optional)" aria-label="Reason" />
          <DialogFooter>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => start(async () => done(await cancelAssignmentAction(a.id, reason), "Assignment cancelled"))}>
              {pending && <Loader2 className="size-3.5 animate-spin" />} Cancel assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
