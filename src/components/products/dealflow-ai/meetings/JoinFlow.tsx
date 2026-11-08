"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hourglass, Loader2, TriangleAlert, Video } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import MeetingRoom from "@/components/products/dealflow-ai/meetings-room/MeetingRoom";
import DeviceCheck from "./DeviceCheck";
import type { MeetingRoomProps } from "@/lib/dealflow-ai/meetings/room-props";
import { formatLong } from "@/lib/dealflow-ai/meetings/ui";
import { cn } from "@/lib/utils";

type Props = {
  roomId: string;
  title: string;
  scheduledAt: string;
  timezone: string;
  /** Who is joining, as fixed by the server (shown, never edited). */
  displayName: string;
  /** Guests send their personal token; staff use their session. */
  guestToken?: string;
  leaveHref: string;
};

type Stop = { code: string; message: string; meeting?: { title: string; scheduledAt: string; timezone: string; status: string } };

const TITLES: Record<string, string> = {
  invalid: "This link doesn't work", expired: "This link has expired", cancelled: "This meeting was cancelled", ended: "This meeting has ended", locked: "The meeting is locked", not_started: "Waiting for the host", waiting: "Waiting to be let in",
  denied: "You can't join this meeting", not_configured: "Video isn't set up", not_found: "Meeting not found",
};

/** Device check, name confirmation, then the room. Handles every state the server can answer with: not started, waiting room, locked, ended, expired, revoked. */
export default function JoinFlow(p: Props) {
  const [joining, setJoining] = useState(false);
  const [stop, setStop] = useState<Stop | null>(null);
  const [room, setRoom] = useState<Omit<MeetingRoomProps, "leaveHref"> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);
  const again = useRef<() => void>(() => undefined);
  useEffect(() => { live.current = true; return () => { live.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);

  const join = useCallback(async () => {
    setJoining(true);
    try {
      const res = await fetch(`/api/dealflow-ai/meetings/${encodeURIComponent(p.roomId)}/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.guestToken ? { token: p.guestToken } : {}) });
      const data = await res.json().catch(() => ({}));
      if (!live.current) return;
      if (data.ok) { setRoom(data); setStop(null); setJoining(false); return; }
      const code: string = data.code ?? (res.status === 429 ? "wait" : "error");
      const next: Stop = { code, message: res.status === 429 ? "Too many attempts. Wait a moment." : (data.error ?? "Couldn't join. Try again."), meeting: data.meeting };
      setStop(next);
      // These resolve themselves: keep asking, gently.
      if (code === "waiting" || code === "not_started" || code === "wait") timer.current = setTimeout(() => again.current(), code === "waiting" ? 3000 : 8000);
      else setJoining(false);
    } catch {
      if (live.current) { setStop({ code: "error", message: "Couldn't reach the server. Check your connection and try again." }); setJoining(false); }
    }
  }, [p.guestToken, p.roomId]);
  useEffect(() => { again.current = () => void join(); }, [join]);

  if (room) return <MeetingRoom {...room} leaveHref={p.leaveHref} />;

  const waiting = stop && ["waiting", "not_started", "wait"].includes(stop.code);
  const final = stop && !waiting && stop.code !== "error";
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        <div className="text-center">
          <div className={cn("mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl", final ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary")}>{final ? <TriangleAlert className="size-7" /> : waiting ? <Hourglass className="size-7" /> : <Video className="size-7" />}</div>
          <h1 className="text-xl font-bold">{stop ? (TITLES[stop.code] ?? "Couldn't join") : p.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{stop ? stop.message : formatLong(p.scheduledAt, p.timezone)}</p>
          {stop?.meeting && <p className="mt-1 text-xs text-muted-foreground">{stop.meeting.title} · {formatLong(stop.meeting.scheduledAt, stop.meeting.timezone)}</p>}
        </div>
        {final ? (
          <a href={p.leaveHref} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>{p.guestToken ? "Close" : "Back to meetings"}</a>
        ) : waiting ? (
          <div className="space-y-3 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /><p className="text-xs text-muted-foreground">{stop!.code === "waiting" ? "You'll be let in as soon as the host admits you." : "This page checks again automatically. You'll go in when the host starts."}</p><Button variant="outline" onClick={() => { if (timer.current) clearTimeout(timer.current); setStop(null); setJoining(false); }}>Leave</Button></div>
        ) : (
          <>
            <DeviceCheck />
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">Joining as <span className="font-semibold">{p.displayName}</span>{p.guestToken ? <span className="block text-xs text-muted-foreground">This is your personal link. Please don&apos;t share it; if this isn&apos;t you, ask your host for your own.</span> : null}</div>
            <Button className="w-full" size="lg" disabled={joining} onClick={() => void join()}>{joining ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}{joining ? "Joining…" : "Join meeting"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
