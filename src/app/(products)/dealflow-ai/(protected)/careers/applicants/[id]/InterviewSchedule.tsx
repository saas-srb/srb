"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Trash2, Check, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { SerializedInterview, InterviewMode } from "@/lib/products/clientos/interviews";
import { addInterviewAction, removeInterviewAction, setInterviewStatusAction } from "./interview-actions";

export default function InterviewSchedule({ applicationId, initial }: { applicationId: string; initial: SerializedInterview[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(initial.length === 0);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ title: "", mode: "video" as InterviewMode, scheduledAt: "", durationMins: 45, round: "", location: "", meetingLink: "", panel: "", notes: "" });

  function refresh(next: SerializedInterview[]) {
    setRows(next.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
  }

  function submit() {
    if (!form.title.trim() || !form.scheduledAt) {
      toast.error("Title and date/time are required.");
      return;
    }
    start(async () => {
      const res = await addInterviewAction(applicationId, form);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Interview scheduled — the applicant has been notified.");
      // optimistic reload of the list
      const optimistic: SerializedInterview = {
        _id: `tmp-${Date.now()}`,
        leadId: null,
        applicationId,
        title: form.title,
        round: form.round || null,
        mode: form.mode,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMins: form.durationMins,
        location: form.location || null,
        meetingLink: form.meetingLink || null,
        panel: form.panel || null,
        status: "scheduled",
        notes: form.notes || null,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      refresh([...rows, optimistic]);
      setForm({ title: "", mode: "video", scheduledAt: "", durationMins: 45, round: "", location: "", meetingLink: "", panel: "", notes: "" });
      setOpen(false);
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await removeInterviewAction(applicationId, id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      refresh(rows.filter((r) => r._id !== id));
    });
  }

  function setStatus(id: string, status: "completed" | "cancelled") {
    start(async () => {
      const res = await setInterviewStatusAction(applicationId, id, status);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      refresh(rows.map((r) => (r._id === id ? { ...r, status } : r)));
    });
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && !open && <p className="text-sm text-muted-foreground">No interviews scheduled.</p>}

      {rows.map((iv) => (
        <div key={iv._id} className="rounded-lg border border-border/60 p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">{iv.title}</p>
              <p className="text-xs text-muted-foreground">
                <CalendarClock className="mr-1 inline size-3.5" />
                {new Date(iv.scheduledAt).toLocaleString()} · {iv.durationMins} min · {iv.mode}
                {iv.round ? ` · ${iv.round}` : ""}
              </p>
              {iv.panel && <p className="text-xs text-muted-foreground">Product: {iv.panel}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize">{iv.status}</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {iv.status === "scheduled" && (
              <>
                <Button size="xs" variant="outline" disabled={pending} onClick={() => setStatus(iv._id, "completed")}>
                  <Check className="size-3" /> Done
                </Button>
                <Button size="xs" variant="outline" disabled={pending} onClick={() => setStatus(iv._id, "cancelled")}>
                  <X className="size-3" /> Cancel
                </Button>
              </>
            )}
            <Button size="xs" variant="ghost" className="text-destructive" disabled={pending} onClick={() => remove(iv._id)}>
              <Trash2 className="size-3" /> Remove
            </Button>
          </div>
        </div>
      ))}

      {open ? (
        <div className="space-y-2.5 rounded-lg border border-dashed border-border p-3">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Technical round 1" />
            </div>
            <div className="space-y-1">
              <Label>Date &amp; time</Label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Duration (min)</Label>
              <Input type="number" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>Mode</Label>
              <Select value={form.mode} onValueChange={(v) => v && setForm({ ...form, mode: v as InterviewMode })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="onsite">On-site</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Round (optional)</Label>
              <Input value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} />
            </div>
            {form.mode === "video" ? (
              <div className="space-y-1 sm:col-span-2">
                <Label>Meeting link</Label>
                <Input value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} placeholder="https://…" />
              </div>
            ) : (
              <div className="space-y-1 sm:col-span-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            )}
            <div className="space-y-1 sm:col-span-2">
              <Label>Product (optional)</Label>
              <Input value={form.panel} onChange={(e) => setForm({ ...form, panel: e.target.value })} placeholder="Names of interviewers" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={submit}>Schedule &amp; notify</Button>
            {rows.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            )}
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Add interview
        </Button>
      )}
    </div>
  );
}
