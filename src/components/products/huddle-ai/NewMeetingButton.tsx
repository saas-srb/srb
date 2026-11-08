"use client";

import { useState, useTransition } from "react";
import { Video, CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMeetingAction } from "@/app/(products)/huddle-ai/(protected)/meetings/actions";

interface U {
  _id: string;
  displayName: string;
}

export default function NewMeetingButton({ users }: { users: U[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMins, setDurationMins] = useState(30);
  const [invitees, setInvitees] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(true);

  const filtered = users.filter((u) => u.displayName.toLowerCase().includes(q.toLowerCase()));

  function start(kind: "instant" | "scheduled", overrideTitle?: string) {
    setError(null);
    const t = (overrideTitle ?? title).trim();
    if (t.length < 2) return setError("Give the meeting a title.");
    if (kind === "scheduled" && !startAt) return setError("Pick a start time.");
    startTransition(async () => {
      const res = await createMeetingAction({
        title: t,
        description: description || undefined,
        kind,
        startAt: kind === "scheduled" ? new Date(startAt).toISOString() : undefined,
        durationMins,
        inviteeIds: [...invitees],
        recordingEnabled,
        screenShareEnabled: kind === "instant" ? true : screenShareEnabled,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => start("instant", title.trim() || "Instant meeting")}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Video className="size-3.5" data-icon="inline-start" />}
          Instant meeting
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <CalendarPlus className="size-3.5" data-icon="inline-start" />
          Schedule
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Schedule a meeting</SheetTitle>
            <SheetDescription>Invite people, set a time, pick your options.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-title">Title</Label>
              <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sprint planning" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-desc">Description (optional)</Label>
              <Input id="m-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-start">Starts</Label>
                <Input id="m-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-dur">Duration (min)</Label>
                <Input
                  id="m-dur"
                  type="number"
                  min={5}
                  max={480}
                  value={durationMins}
                  onChange={(e) => setDurationMins(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Invite ({invitees.size})</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="rounded-xl border-border/50 bg-background px-3 py-1.5 text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
              />
              <div className="max-h-44 overflow-y-auto rounded-xl border border-border/60 p-1">
                {filtered.map((u) => (
                  <label key={u._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={invitees.has(u._id)}
                      onChange={() => {
                        const n = new Set(invitees);
                        if (n.has(u._id)) n.delete(u._id);
                        else n.add(u._id);
                        setInvitees(n);
                      }}
                      className="accent-primary"
                    />
                    {u.displayName}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={screenShareEnabled} onChange={(e) => setScreenShareEnabled(e.target.checked)} className="accent-primary" />
                Allow screen sharing
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={recordingEnabled} onChange={(e) => setRecordingEnabled(e.target.checked)} className="accent-primary" />
                Enable recording
              </label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="border-t border-border/60 p-4">
            <Button type="button" className="w-full" disabled={pending} onClick={() => start("scheduled")}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Schedule meeting"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
