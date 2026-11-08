"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import JoinFlow from "@/components/products/dealflow-ai/meetings/JoinFlow";
import { formatLong } from "@/lib/dealflow-ai/meetings/ui";

type Status =
  | { state: "loading" }
  | { state: "ok"; name: string; title: string; scheduledAt: string; timezone: string }
  | { state: "stop"; code: string; message: string; meeting?: { title: string; scheduledAt: string; timezone: string } };

const HEADINGS: Record<string, string> = { invalid: "This link doesn't work", expired: "This link has expired", cancelled: "This meeting was cancelled", ended: "This meeting has ended" };

/** The page behind a guest's personal link: checks the link first (nothing is issued), then hands over to the join flow. */
export default function GuestJoinClient({ roomId, token }: { roomId: string; token: string }) {
  const [s, setS] = useState<Status>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return setS({ state: "stop", code: "invalid", message: "This link is incomplete. Open the link from your invitation exactly as it was sent." });
      try {
        const res = await fetch(`/api/dealflow-ai/meetings/${encodeURIComponent(roomId)}/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, check: true }) });
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (d.ok) setS({ state: "ok", name: d.name, title: d.title, scheduledAt: d.scheduledAt, timezone: d.timezone });
        else setS({ state: "stop", code: d.code ?? "invalid", message: res.status === 429 ? "Too many attempts. Wait a moment and reload." : (d.error ?? "This link doesn't work."), meeting: d.meeting });
      } catch {
        if (!cancelled) setS({ state: "stop", code: "error", message: "Couldn't reach the server. Check your connection and reload." });
      }
    })();
    return () => { cancelled = true; };
  }, [roomId, token]);

  if (s.state === "loading") return <div className="flex min-h-screen items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  if (s.state === "stop") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-3 rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500"><TriangleAlert className="size-7" /></div>
          <h1 className="text-xl font-bold">{HEADINGS[s.code] ?? "Couldn't open this meeting"}</h1>
          <p className="text-sm text-muted-foreground">{s.message}</p>
          {s.meeting && <p className="text-xs text-muted-foreground">{s.meeting.title} · {formatLong(s.meeting.scheduledAt, s.meeting.timezone)}</p>}
        </div>
      </div>
    );
  }
  return <JoinFlow roomId={roomId} title={s.title} scheduledAt={s.scheduledAt} timezone={s.timezone} displayName={s.name} guestToken={token} leaveHref="/" />;
}
